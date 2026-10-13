/**
 * Satellite relay (#91): a local library forwards what it accepted to a hub, metadata only. Prompt text,
 * commands and tool output are never sent (#59): the hub gets enough to draw the tower, not what was
 * asked or answered. The queue is bounded and lives in memory: a hub that stays down costs a counter,
 * not the disk.
 */
import type { FlowEvent } from '../core/events.ts';
import { errorMessage, forward, isRefusal, nextBackoff, postJson } from './relay-wire.ts';
import { HEARTBEAT_MS, MIN_GAP_MS, RECHECK_MS, type RelayCredentials, type RelayOptions, type RelayState } from './relay-types.ts';

export type { RelayCredentials, RelayOptions, RelayState } from './relay-types.ts';

/** The relay behind a satellite: push accepted events, inspect state, stop. Never holds the token in `state`. */
export function createRelay(opts: RelayOptions) {
  let hub = opts.url.replace(/\/+$/, '');
  let token = opts.token;
  const send = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? Date.now;
  const maxQueue = opts.maxQueue ?? 5_000;
  const batch = opts.batch ?? 500;
  const recheckMs = opts.recheckMs ?? RECHECK_MS;

  const queue: Record<string, unknown>[] = [];
  let dropped = 0;
  let discardedOnPause = 0;
  // Refused (revoked) and paused by the hub (held) are kept apart: the message differs, and only a held
  // machine is expected to resume by itself. Both stop sending until a recheck gets a 2xx.
  let revoked = false;
  let held = false;
  let stopped = false;
  // Bumped by every change of credentials or run state. A request captures it before it leaves, and an answer
  // that comes back under another value was sent with a token or a state that no longer applies: it is ignored.
  let generation = 0;
  const stale = (gen: number) => stopped || gen !== generation;
  let inFlight = false;
  // The running flush, so a sharing test can wait for it instead of interleaving its own POST with it.
  let inFlightPromise: Promise<void> | undefined;
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
  let recheckTimer: NodeJS.Timeout | undefined;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  /** A timer must never keep the process alive on its own: the dev server decides when it stops. */
  const schedule = () => {
    if (timer || stopped || revoked || held || paused || inFlight || !queue.length) return;
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
    if (stopped || revoked || held || paused || inFlight || !queue.length) return;
    inFlight = true;
    inFlightPromise = runFlush();
    try {
      await inFlightPromise;
    } finally {
      inFlightPromise = undefined;
      inFlight = false;
      schedule();
      report();
    }
  }

  async function runFlush(): Promise<void> {
    lastAttempt = now();
    const slice = queue.slice(0, batch);
    const gen = generation;
    try {
      const res = await postJson(send, `${hub}/api/events`, token, slice);
      if (stale(gen)) return;
      // The hub refuses us: keep the events and stop sending until a recheck gets a 2xx.
      if (isRefusal(res)) return refusedAndRecheck(res, gen);
      if (res.ok) {
        queue.splice(0, slice.length);
        // Keep the last wire payload (content already stripped) so the UI can show what left the machine.
        acknowledged(slice[slice.length - 1]);
        return;
      }
      // The hub is busy or broken: keep the events and try again later, backing off each time.
      if (res.status === 429 || res.status >= 500) return failed(`hub answered ${res.status}`);
      // Any other 4xx means the batch itself is refused: retrying it forever would block the queue.
      queue.splice(0, slice.length);
      dropped += slice.length;
      lastError = `hub rejected the batch (${res.status})`;
      // The hub did answer, so waiting events are not stuck on an unreachable hub.
      unreachable = false;
    } catch (err) {
      if (stale(gen)) return;
      failed(errorMessage(err));
    }
  }

  /** The send failed on the hub's side or the network: keep the events, back off, and mark them waiting. */
  const failed = (message: string) => {
    lastError = message;
    backoff = nextBackoff(backoff);
    unreachable = true;
  };

  /**
   * A 2xx for a batch or a test event. Any 2xx is authoritative: a hub that accepts the batch has accepted
   * us, whatever the state said, so a refused or held relay recovers here.
   */
  const acknowledged = (payload: Record<string, unknown> | undefined) => {
    lastSentAt = now();
    lastPayload = payload;
    lastError = undefined;
    backoff = 0;
    unreachable = false;
    if (revoked || held) recovered();
  };

  /** A 401/403 (step 1): record the refusal, then keep the recheck ticking. Stale answers change nothing. */
  async function refusedAndRecheck(res: Response, gen: number): Promise<void> {
    await refused(res, gen);
    if (stale(gen)) return;
    scheduleRecheck();
  }

  /**
   * A 401/403 from the hub (step 1). The body says why: `state: 'paused'` means the hub owner paused this
   * machine, which ends by itself when they resume it; anything else is a refused token. The body is read
   * best effort, so a hub that sends no JSON still gets the plain refusal, and nothing here may throw.
   */
  async function refused(res: Response, gen: number): Promise<void> {
    const body = (await res.json().catch(() => undefined)) as { state?: unknown } | undefined;
    // Reading the body is an await too: an answer that went stale meanwhile must not flip the state.
    if (stale(gen)) return;
    const pausedByHub = body?.state === 'paused';
    held = pausedByHub;
    revoked = !pausedByHub;
    lastError = pausedByHub ? 'the hub paused this machine' : `hub refused the token (${res.status})`;
  }

  const push = (events: FlowEvent[]) => {
    // While paused nothing leaves and nothing waits to leave: the events stay local (the user's own view
    // still gets them, ingest is untouched) instead of piling up in the queue. A hub refusal or hold is
    // different: the queue is kept, so a resume delivers what happened meanwhile.
    if (stopped || paused) return;
    for (const e of events) queue.push(forward(e, opts));
    if (queue.length > maxQueue) {
      // A hub that stays down must not grow without bound: the newest events matter most.
      dropped += queue.length - maxQueue;
      queue.splice(0, queue.length - maxQueue);
    }
    schedule();
    report();
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
    clearTimeout(hbTimer);
    hbTimer = undefined;
  };

  /** The next beat: sooner after a failure (the shared backoff), otherwise a full interval later. */
  const scheduleHeartbeat = (delay: number) => {
    if (stopped || revoked || held || paused) return;
    clearHbTimer();
    hbTimer = setTimeout(() => {
      hbTimer = undefined;
      void heartbeat();
    }, delay);
    hbTimer.unref();
  };

  const postHeartbeat = () => postJson(send, `${hub}/api/heartbeat`, token, heartbeatBody());

  /**
   * One heartbeat. A failed beat must never throw or stop the relay: it follows the same revoked/backoff
   * rules as the event flush, so a hub that refused us stops the beats too, and a slow hub just waits.
   */
  async function heartbeat(): Promise<void> {
    if (stopped || revoked || held || paused) return;
    await beat();
    report();
  }

  async function beat(): Promise<void> {
    const gen = generation;
    try {
      const res = await postHeartbeat();
      if (stale(gen)) return;
      if (isRefusal(res)) return refusedAndRecheck(res, gen);
      if (res.status === 429 || res.status >= 500) {
        failed(`hub answered ${res.status}`);
        return scheduleHeartbeat(backoff);
      }
    } catch (err) {
      if (stale(gen)) return;
      failed(errorMessage(err));
      return scheduleHeartbeat(backoff);
    }
    scheduleHeartbeat(HEARTBEAT_MS);
  }

  // One beat right away, so the hub lists this satellite before the first event ever arrives.
  scheduleHeartbeat(0);

  // clearTimeout(undefined) is a no-op, so the guard the timers used to need is gone.
  const clearRecheckTimer = () => {
    clearTimeout(recheckTimer);
    recheckTimer = undefined;
  };

  /**
   * While refused or held, one heartbeat per recheck tick (step 2) asks the hub whether this machine is
   * accepted again. The timer is unref'd like the others, and it stops as soon as the relay recovers.
   */
  const scheduleRecheck = () => {
    if (stopped || paused || recheckTimer || !(revoked || held)) return;
    recheckTimer = setTimeout(() => {
      recheckTimer = undefined;
      void recheck();
    }, recheckMs);
    recheckTimer.unref();
  };

  async function recheck(): Promise<void> {
    // A test or a flush already on the wire owns the next answer: a second request now could race it, so this
    // tick is skipped and the next one asks again.
    if (stopped || paused || !(revoked || held) || inFlight) {
      scheduleRecheck();
      return;
    }
    const gen = generation;
    try {
      const res = await postHeartbeat();
      if (stale(gen)) return;
      if (res.ok) {
        // recovered() bumps the generation itself, so report here instead of falling through the check below.
        recovered();
        report();
        return;
      }
      if (res.status === 401 || res.status === 403) await refused(res, gen);
    } catch {
      // Unreachable right now: the next tick tries again, and the state keeps what the hub last said.
      if (stale(gen)) return;
    }
    if (stale(gen)) return;
    report();
    scheduleRecheck();
  }

  /**
   * The hub accepted us again (a recheck, a sharing test or new credentials): the relay resumes by itself.
   * The queue was kept while refused or held, so the flush delivers what happened meanwhile.
   */
  const recovered = () => {
    generation++;
    clearRefusal();
    resumeSending();
  };

  /** Forget the refusal or hold and the failure streak: the relay is willing to send again. */
  const clearRefusal = () => {
    revoked = false;
    held = false;
    backoff = 0;
    unreachable = false;
    lastError = undefined;
    clearRecheckTimer();
  };

  /** Flush and beat right away: the first push must not wait out a gap that no longer applies. */
  const resumeSending = () => {
    scheduleHeartbeat(0);
    lastAttempt = now() - MIN_GAP_MS;
    schedule();
  };

  /** The word the UI shows right now; `report` compares it with the last one it published. */
  const stateWord = (): RelayState['state'] =>
    revoked ? 'revoked' : held ? 'held' : paused ? 'paused' : unreachable && queue.length ? 'queued' : 'online';

  const state = (): RelayState => ({
    // 'queued' means events wait because the last send attempt failed (unreachable hub, 5xx or 429).
    // Events simply waiting for the next flush are normal: a healthy relay stays 'online'.
    state: stateWord(),
    hub,
    queued: queue.length,
    dropped,
    discardedOnPause,
    ...(lastSentAt !== undefined ? { lastSentAt } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
    ...(lastPayload !== undefined ? { lastPayload } : {}),
  });

  // The word at creation is the baseline: only a later change is reported.
  let reported = stateWord();
  /** Publish the state word when it changed since the last report (step 5). */
  const report = () => {
    const word = stateWord();
    if (word === reported) return;
    reported = word;
    // An online relay has no error to report, even if the last failure's text is still kept for the UI.
    opts.onStateChange?.(word, word === 'online' ? undefined : lastError);
  };

  const clearAllTimers = () => {
    clearTimer();
    clearHbTimer();
    clearRecheckTimer();
  };

  const stop = () => {
    generation++;
    stopped = true;
    clearAllTimers();
  };

  /**
   * Pause (#91): stop sending and stop queueing. Events accepted from now on stay local, and whatever is
   * already queued is thrown away (counted in discardedOnPause): the pause promises that nothing collected
   * before or during it leaves later, so a resume must not flush a backlog built while the user watched.
   */
  const pause = () => {
    generation++;
    paused = true;
    clearAllTimers();
    discardedOnPause += queue.length;
    queue.length = 0;
    report();
  };

  /** Resume: the heartbeats start again, and new events are queued and sent as before. */
  const resume = () => {
    if (!paused) return;
    generation++;
    paused = false;
    lastAttempt = now() - MIN_GAP_MS;
    schedule();
    scheduleHeartbeat(0);
    scheduleRecheck();
    report();
  };

  /**
   * New credentials (step 4): the user fixed the token or pointed the relay at another hub. The queue is
   * kept, and the relay flushes and beats right away instead of waiting out a recheck.
   */
  const setCredentials = (creds: RelayCredentials) => {
    // An answer to the old token, still on the wire, must not refuse or recover the relay under the new one.
    generation++;
    hub = creds.url.replace(/\/+$/, '');
    token = creds.token;
    // The old token's refusal no longer applies: a stale error would read as if the new token failed too.
    clearRefusal();
    resumeSending();
    report();
  };

  /**
   * The sharing test (#91): one minimal event the hub accepts like any other, flushed now so the answer
   * tells the user whether the relay works. It carries no message and no data: a "does it reach the hub"
   * probe must not leak local content. It also works while refused or held: it is the user's "try now".
   */
  const sendTest = async () => {
    if (stopped || paused) return state();
    // A flush already on the wire owns the shared state (queue, backoff, lastError): wait it out, so the
    // test and a flush never interleave.
    if (inFlightPromise) await inFlightPromise;
    if (stopped || paused) return state();
    inFlight = true;
    inFlightPromise = runTest();
    try {
      await inFlightPromise;
    } finally {
      inFlightPromise = undefined;
      inFlight = false;
      schedule();
      report();
    }
    return state();
  };

  async function runTest(): Promise<void> {
    // A minimal 'log': message, tool, node and data are simply absent, so the probe tags the hub without
    // carrying any local content.
    const payload = forward({ kind: 'log', source: 'flow-tower', status: 'ok' } as unknown as FlowEvent, opts);
    lastAttempt = now();
    const gen = generation;
    try {
      const res = await postJson(send, `${hub}/api/events`, token, [payload]);
      if (stale(gen)) return;
      if (isRefusal(res)) return refusedAndRecheck(res, gen);
      if (res.ok) return acknowledged(payload);
      // The sharing test does not back off: the user asked once, and the answer is shown as it is.
      lastError = `hub answered ${res.status}`;
    } catch (err) {
      if (stale(gen)) return;
      lastError = errorMessage(err);
      unreachable = true;
    }
  }

  return { push, state, stop, pause, resume, sendTest, setCredentials, flush: () => attempt(), heartbeat };
}
