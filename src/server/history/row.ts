/**
 * One event → one history row (#84), by ALLOW-LIST: only the columns of the schema are read off the
 * event and copied, so a new field a source adds (a prompt, a path, a command) can never reach the DB
 * by accident. `message`, `data`, `prompt`, file paths and command arguments are simply never touched.
 */
import type { FlowEvent } from '../../core/events.ts';
import { eventIdOf } from '../limits.ts';

/** The writable columns of `events`, in schema order. Content-free by construction. */
export interface Row {
  ts: number;
  sender: string | null;
  user: string | null;
  host: string | null;
  runtime: string | null;
  project: string | null;
  session: string | null;
  kind: string;
  tool: string | null;
  model: string | null;
  in_tok: number;
  out_tok: number;
  cache_read: number;
  cache_write: number;
  cost_usd_micros: number;
  estimated: number;
  duration_ms: number | null;
  status: string | null;
  auto: number;
  event_key: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Maps a normalized event onto a row. `now` fills a missing ts (an event straight from a caller that
 * bypassed ingest still gets a time). Returns undefined for an event with no usable time at all: a row
 * without a ts would sort under 1970 and pollute the reads.
 */
export function toRow(e: FlowEvent, now: number): Row | undefined {
  const ts = num(e.ts) ?? now;
  if (!Number.isFinite(ts)) return undefined;
  // tokens_detail is the precise breakdown; a bare `tokens` total is the fallback, recorded as input.
  const d = e.tokens_detail;
  const id = eventIdOf(e);
  return {
    ts,
    sender: str(e.sender),
    user: str(e.user),
    host: str(e.host),
    runtime: str(e.runtime),
    project: str(e.project),
    session: str(e.session),
    kind: e.kind,
    tool: str(e.tool),
    model: str(e.model),
    in_tok: d ? num(d.input) ?? 0 : num(e.tokens) ?? 0,
    out_tok: d ? num(d.output) ?? 0 : 0,
    cache_read: d ? num(d.cache_read) ?? 0 : 0,
    cache_write: d ? num(d.cache_write) ?? 0 : 0,
    // Money is stored as integer micros: floats in a sum drift, integers do not.
    cost_usd_micros: Math.round((num(e.cost_usd) ?? 0) * 1_000_000),
    estimated: e.estimated ? 1 : 0,
    duration_ms: num(e.duration_ms),
    status: str(e.status),
    auto: 0, // no source marks an event automatic yet; the column is here for the read side.
    event_key: id === undefined ? null : `${e.sender ?? ''}:${id}`,
  };
}
