/**
 * The wire side of the satellite relay (#91): what a forwarded event may contain. Kept apart from relay.ts
 * so the send state machine there stays readable; the allow-list rules themselves are unchanged.
 */
import type { FlowEvent } from '../core/events.ts';

/**
 * The wire allow-list: the metadata the hub may see, and nothing else. An allow-list (not a drop-list)
 * means an adapter or a custom source that adds a field (a path, a command, a token) cannot leak it by
 * being unknown to us; `role` (the Task/Agent description) is deliberately absent for the same reason.
 */
const ALLOWED = [
  'kind', 'ts', 'source', 'session', 'agent', 'parent', 'tool', 'call', 'model', 'node', 'tower',
  'project', 'user', 'host', 'runtime', 'status', 'tokens', 'tokens_detail', 'cost_usd',
  'duration_ms', 'estimated',
] as const;

/** One wire payload: only the allow-listed metadata, plus this sender's identity defaults. */
export function forward(event: FlowEvent, { user, machine }: { user?: string; machine?: string }): Record<string, unknown> {
  const request = requestIdOf(event.data);
  const src = event as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) if (src[key] !== undefined) out[key] = src[key];
  // The hub fills user/host from the event; a satellite without a local user still names its machine.
  if (out.user === undefined && user !== undefined) out.user = user;
  if (out.host === undefined && machine !== undefined) out.host = machine;
  // request_id is a correlation id, not content: the hub can still dedupe without seeing the prompt.
  if (request !== undefined) out.event_id = request;
  return out;
}

/** request_id lives in `data`, which is dropped: pick it out first, and only when it is a plain id. */
function requestIdOf(data: unknown): string | number | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const id = (data as Record<string, unknown>).request_id;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}
