// History writer: one row per accepted event, deduped on event_key.
// The events table has `event_key TEXT UNIQUE`, and rows are written with
//   INSERT OR IGNORE INTO events (...) VALUES (...)
// so a replayed delivery of the same event (a retry after a network error) collapses to one row.

type FlowEvent = {
  kind: 'session.start' | 'tool.start' | 'tool.end' | 'error' | 'agent.end' | 'usage';
  sender?: string; ts?: number; tool?: string; status?: 'ok' | 'error';
  call?: string;                       // the tool call id: the same on a call's tool.start and tool.end
  event_id?: string;                   // set by sources that number their events
  data?: { request_id?: string; call?: string };
  duration_ms?: number; cost_usd?: number;
};

type Row = { ts: number; sender: string | null; kind: string; tool: string | null; status: string | null;
  duration_ms: number | null; cost_usd_micros: number; event_key: string | null };

/** Stable id of an event, for dedupe: a source's own id wins (OTLP request_id, a tool call id), then event_id. */
export function eventIdOf(e: FlowEvent): string | undefined {
  for (const c of [e.data?.request_id, e.data?.call, e.call, e.event_id]) if (typeof c === 'string' && c) return c;
  return undefined;
}

export function toRow(e: FlowEvent, now: number): Row | undefined {
  const ts = e.ts ?? now;
  if (!Number.isFinite(ts)) return undefined;
  const id = eventIdOf(e);
  return {
    ts,
    sender: e.sender ?? null,
    kind: e.kind,
    tool: e.tool ?? null,
    status: e.status ?? null,
    duration_ms: e.duration_ms ?? null,
    // Money is stored as integer micros: floats in a sum drift, integers do not.
    cost_usd_micros: Math.round((e.cost_usd ?? 0) * 1_000_000),
    event_key: id === undefined ? null : `${e.sender ?? ''}:${id}`,
  };
}
