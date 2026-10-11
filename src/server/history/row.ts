/**
 * One event → one history row (#84), by ALLOW-LIST: only the columns of the schema are read off the
 * event and copied, so a new field a source adds (a prompt, a path, a command) can never reach the DB
 * by accident. `message`, `data`, `prompt`, file paths and command arguments are simply never touched.
 */
import type { FlowEvent } from '../../core/events.ts';
import { tokenAttr } from '../../core/identity.ts';
import { eventIdOf } from '../limits.ts';

/** The writable columns of `events`, in schema order. Content-free by construction. */
export interface Row {
  ts: number;
  sender: string | null;
  /** Identity fields are stored as '' (never NULL) when missing: `history delete --user ''` must match. */
  user: string;
  host: string;
  runtime: string;
  project: string;
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
/** Same as `str` but never NULL: the identity columns use '' for "unknown", like the rollup keys. */
const text = (v: unknown): string => str(v) ?? '';

/**
 * The same breakdown read off a flat `data` bag, using the attribute cascade from identity.ts so every
 * spelling a source may use ("cached_tokens", "cache_read_input_tokens"...) is accepted. `data` is
 * untrusted and may be anything, so a non-object simply has no tokens.
 */
function flatDetail(data: unknown): FlowEvent['tokens_detail'] {
  if (typeof data !== 'object' || data === null) return undefined;
  const a = data as Record<string, unknown>;
  const input = tokenAttr(a, 'input');
  const output = tokenAttr(a, 'output');
  const cache_read = tokenAttr(a, 'cache_read');
  const cache_write = tokenAttr(a, 'cache_write');
  return input === undefined && output === undefined && cache_read === undefined && cache_write === undefined
    ? undefined
    : { input, output, cache_read, cache_write };
}

/**
 * Maps a normalized event onto a row. `now` fills a missing ts (an event straight from a caller that
 * bypassed ingest still gets a time). Returns undefined for an event with no usable time at all: a row
 * without a ts would sort under 1970 and pollute the reads.
 */
export function toRow(e: FlowEvent, now: number): Row | undefined {
  const ts = num(e.ts) ?? now;
  if (!Number.isFinite(ts)) return undefined;
  // tokens_detail is the precise breakdown; when it is missing, the flat fields a source put in `data`
  // (Claude's `input_tokens`/`cache_creation_tokens`, Codex's `cached_tokens`) are just as good. A bare
  // `tokens` total is the last resort, recorded as input.
  const d = e.tokens_detail ?? flatDetail(e.data);
  const id = eventIdOf(e);
  return {
    ts,
    sender: str(e.sender),
    user: text(e.user),
    host: text(e.host),
    runtime: text(e.runtime),
    project: text(e.project),
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
