/**
 * Satellite relay (#91): a local library forwards what it accepted to a hub, metadata only. Prompt text,
 * commands and tool output are never sent (#59): the hub gets enough to draw the tower, not what was
 * asked or answered. The queue is bounded and lives in memory: a hub that stays down costs a counter,
 * not the disk.
 */
import type { FlowEvent } from '../core/events.ts';

/** Fields the hub fills in itself, or that carry prompt/tool content: they never leave this machine. */
const PRIVACY = ['id', 'targets', 'runtimeRef', 'sender', 'message', 'data'] as const;

const TIMEOUT_MS = 5_000;
/** Never more than one flush a second; a failing hub waits longer (1 s, 2 s, 4 s … max 60 s). */
const MIN_GAP_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
/** How often a satellite tells the hub it is alive (#91): the hub calls it offline after three of these. */
const HEARTBEAT_MS = 60_000;

export interface RelayOptions {
  url: string;
  token?: string;
  user?: string;
  machine?: string;
  /** The local flow-tower version, reported in the heartbeat so the hub can show it. */
  version?: string;
  /** Injectable for tests: the HTTP client and the clock. */
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  maxQueue?: number;
  batch?: number;
  /** Start paused (#91): the config's `paused` key, read once when the relay is created. */
  paused?: boolean;
}

export interface RelayState {
  state: 'online' | 'queued' | 'revoked' | 'paused';
  hub: string;
  queued: number;
  dropped: number;
  lastSentAt?: number;
  lastError?: string;
  /** The last event that actually left this machine, after the content was stripped: never the token. */
  lastPayload?: Record<string, unknown>;
}

/** The relay behind a satellite: push accepted events, inspect state, stop. Never holds the token in `state`. */
export function createRelay(opts: RelayOptions) {
  const hub = opts.url.replace(/\/+$/, '');
  const send = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? Date.now;
  const maxQueue = opts.maxQueue ?? 5_000;
  const batch = opts.batch ?? 500;

  const queue: Record<string, unknown>[] = [];
  let dropped = 0;
  let revoked = false;
  let stopped = false;
  let inFlight = false;
  let backoff = 0;
  // True while the last send attempt failed on the hub's side: only then are waiting events "queued".
  let unreachable = false;
  // Start "one second ago" so the first push waits out the gap instead of flushing immediately.
  let lastAttempt = now() - MIN_GAP_MS;
  let lastSentAt: number | undefined;
  let lastError: string | undefined;
  let lastPayload: Record<string, unknown> | undefined;
  // Paused (#91): the user asked this machine to stop relaying. Nothing is sent — not even a heartbeat —
  // and nothing is queued either: paused means no event may pile up to leave later behind the user's back.
  let paused = opts.paused ?? false;
  let timer: NodeJS.Timeout | undefined;
  let hbTimer: NodeJS.Timeout | undefined;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };

  /** A timer must never keep the process alive on its own: the dev server decides when it stops. */
  const schedule = () => {
    if (timer || stopped || revoked || paused || inFlight || !queue.length) return;
    // Wait out the rest of the current second plus any backoff, so we never flush twice in one second.
    const delay = Math.max(backoff, MIN_GAP_MS - (now() - lastAttempt));
    timer = setTimeout(() => {
      timer = undefined;
      void attempt();
    }, delay);
    timer.unref();
  };

  async function attempt(): Promise<void> {
    clearTimer();
    if (stopped || revoked || paused || inFlight || !queue.length) return;
    inFlight = true;
    lastAttempt = now();
    const slice = queue.slice(0, batch);
    try {
      const res = await send(`${hub}/api/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { 'x-flow-tower-token': opts.token } : {}),
        },
        body: JSON.stringify(slice),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) {
        // The hub refuses our token: keep the events but stop sending until someone restarts us.
        revoked = true;
        lastError = `hub refused the token (${res.status})`;
        return;
      }
      if (res.ok) {
        queue.splice(0, slice.length);
        lastSentAt = now();
        // Keep the last wire payload (content already stripped) so the UI can show what left the machine.
        lastPayload = slice[slice.length - 1];
        lastError = undefined;
        backoff = 0;
        unreachable = false;
        return;
      }
      if (res.status === 429 || res.status >= 500) {
        // The hub is busy or broken: keep the events and try again later, backing off each time.
        lastError = `hub answered ${res.status}`;
        backoff = nextBackoff(backoff);
        unreachable = true;
        return;
      }
      // Any other 4xx means the batch itself is refused: retrying it forever would block the queue.
      queue.splice(0, slice.length);
      dropped += slice.length;
      lastError = `hub rejected the batch (${res.status})`;
      // The hub did answer, so waiting events are not stuck on an unreachable hub.
      unreachable = false;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      backoff = nextBackoff(backoff);
      unreachable = true;
    } finally {
      inFlight = false;
      schedule();
    }
  }

  const push = (events: FlowEvent[]) => {
    // While paused nothing leaves and nothing waits to leave: the events stay local (the user's own view
    // still gets them, ingest is untouched) instead of piling up in the queue.
    if (stopped || paused) return;
    for (const e of events) queue.push(forward(e, opts));
    if (queue.length > maxQueue) {
      // A hub that stays down must not grow without bound: the newest events matter most.
      dropped += queue.length - maxQueue;
      queue.splice(0, queue.length - maxQueue);
    }
    schedule();
  };

  /** The heartbeat body (#91): the counters and state word `state()` publishes, plus the version. */
  const heartbeatBody = () => {
    const s = state();
    return {
      queued: s.queued,
      dropped: s.dropped,
      state: s.state,
      ...(opts.version !== undefined ? { version: opts.version } : {}),
    };
  };

  const clearHbTimer = () => {
    if (!hbTimer) return;
    clearTimeout(hbTimer);
    hbTimer = undefined;
  };

  /** The next beat: sooner after a failure (the shared backoff), otherwise a full interval later. */
  const scheduleHeartbeat = (delay: number) => {
    if (stopped || revoked || paused) return;
    clearHbTimer();
    hbTimer = setTimeout(() => {
      hbTimer = undefined;
      void heartbeat();
    }, delay);
    hbTimer.unref();
  };

  /**
   * One heartbeat. A failed beat must never throw or stop the relay: it follows the same revoked/backoff
   * rules as the event flush, so a hub that refused us stops the beats too, and a slow hub just waits.
   */
  async function heartbeat(): Promise<void> {
    if (stopped || revoked || paused) return;
    try {
      const res = await send(`${hub}/api/heartbeat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { 'x-flow-tower-token': opts.token } : {}),
        },
        body: JSON.stringify(heartbeatBody()),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) {
        revoked = true;
        lastError = `hub refused the token (${res.status})`;
        return;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = `hub answered ${res.status}`;
        backoff = nextBackoff(backoff);
        unreachable = true;
        scheduleHeartbeat(backoff);
        return;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      backoff = nextBackoff(backoff);
      unreachable = true;
      scheduleHeartbeat(backoff);
      return;
    }
    scheduleHeartbeat(HEARTBEAT_MS);
  }

  // One beat right away, so the hub lists this satellite before the first event ever arrives.
  scheduleHeartbeat(0);

  const state = (): RelayState => ({
    // 'queued' means events wait because the last send attempt failed (unreachable hub, 5xx or 429).
    // Events simply waiting for the next flush are normal: a healthy relay stays 'online'.
    state: revoked ? 'revoked' : paused ? 'paused' : unreachable && queue.length ? 'queued' : 'online',
    hub,
    queued: queue.length,
    dropped,
    ...(lastSentAt !== undefined ? { lastSentAt } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
    ...(lastPayload !== undefined ? { lastPayload } : {}),
  });

  const stop = () => {
    stopped = true;
    clearTimer();
    clearHbTimer();
  };

  /** Pause (#91): stop sending and stop queueing. Events accepted from now on stay local. */
  const pause = () => {
    paused = true;
    clearTimer();
    clearHbTimer();
  };

  /** Resume: the heartbeats start again, and new events are queued and sent as before. */
  const resume = () => {
    if (!paused) return;
    paused = false;
    lastAttempt = now() - MIN_GAP_MS;
    schedule();
    scheduleHeartbeat(0);
  };

  /**
   * The sharing test (#91): one minimal event the hub accepts like any other, flushed now so the answer
   * tells the user whether the relay works. It carries no message and no data: a "does it reach the hub"
   * probe must not leak local content.
   */
  const sendTest = async () => {
    if (stopped || revoked || paused) return state();
    // A minimal 'log': message, tool, node and data are simply absent, so the probe tags the hub without
    // carrying any local content.
    const payload = forward({ kind: 'log', source: 'flow-tower', status: 'ok' } as unknown as FlowEvent, opts);
    inFlight = true;
    lastAttempt = now();
    try {
      const res = await send(`${hub}/api/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { 'x-flow-tower-token': opts.token } : {}),
        },
        body: JSON.stringify([payload]),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) {
        revoked = true;
        lastError = `hub refused the token (${res.status})`;
      } else if (res.ok) {
        lastSentAt = now();
        lastPayload = payload;
        lastError = undefined;
        backoff = 0;
        unreachable = false;
      } else {
        lastError = `hub answered ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      unreachable = true;
    } finally {
      inFlight = false;
      schedule();
    }
    return state();
  };

  return { push, state, stop, pause, resume, sendTest, flush: () => attempt(), heartbeat };
}

const nextBackoff = (current: number) => Math.min(current ? current * 2 : MIN_GAP_MS, MAX_BACKOFF_MS);

/** One wire payload: the event minus what the hub owns or must not see, plus this sender's identity. */
function forward(event: FlowEvent, { user, machine }: Pick<RelayOptions, 'user' | 'machine'>): Record<string, unknown> {
  const request = requestIdOf(event.data);
  const out: Record<string, unknown> = { ...event };
  for (const key of PRIVACY) delete out[key];
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
