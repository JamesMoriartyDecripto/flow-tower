/**
 * The wire side of the satellite relay (#91): what a forwarded event may contain, and how a request is
 * built. Kept apart from relay.ts so the send state machine there stays readable; the allow-list rules
 * themselves are unchanged.
 */
import type { FlowEvent } from '../core/events.ts';
import { MAX_BACKOFF_MS, MIN_GAP_MS, TIMEOUT_MS } from './relay-types.ts';

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

/**
 * One JSON POST to the hub. The token header is sent only when there is a token, so an unpaired relay
 * never sends an empty credential. The timeout is per request: a hung hub must not hold the queue.
 */
export function postJson(
  send: typeof globalThis.fetch,
  url: string,
  token: string | undefined,
  body: unknown,
): Promise<Response> {
  return send(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-flow-tower-token': token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** The next retry delay: 1 s, then doubling, capped at 60 s. Zero (no failure yet) starts at 1 s. */
export const nextBackoff = (current: number) =>
  Math.min(current ? current * 2 : MIN_GAP_MS, MAX_BACKOFF_MS);

/** The hub refused us (401/403): the body decides whether it is a refused token or a hold (step 1). */
export const isRefusal = (res: Response) => res.status === 401 || res.status === 403;

/** The text kept as `lastError` for a thrown request error (network, timeout, abort). */
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
