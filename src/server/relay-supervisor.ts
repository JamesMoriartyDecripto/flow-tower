/**
 * Keeps the satellite relay and the shared-towers sync in step with the user's config while the server runs
 * (#91, #164). Both used to be built once at start, so `flow-tower connect`, a new token or a role change
 * did nothing until a manual restart. Every tick re-reads the settings and makes the running pieces match:
 * a new satellite builds its relay, a new token updates the relay in place, and leaving satellite mode stops
 * everything. The log names what changed, never the token.
 */
import type { RelayCredentials, RelayState } from './relay.ts';
import type { ShareSync } from './share-sync.ts';

/** What the relay needs to exist: a satellite with a hub url. */
export interface RelaySettings {
  url: string;
  token?: string;
  user?: string;
  machine?: string;
  paused: boolean;
}

/** What the config says right now. `allowed` is false when this server must not relay (a hub, or a loop). */
export interface RelayReading {
  role: string;
  url?: string;
  token?: string;
  user?: string;
  machine?: string;
  paused: boolean;
  allowed: boolean;
}

interface SupervisedRelay {
  setCredentials(creds: RelayCredentials): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface RelaySupervisorOptions<R extends SupervisedRelay> {
  read: () => RelayReading;
  /** `shareErrors` names the shares whose last sync failed; the relay reads it on each heartbeat. */
  build: (settings: RelaySettings, onStateChange: (state: RelayState['state'], lastError?: string) => void, shareErrors: () => string[]) => R;
  /** Undefined when the sync cannot run yet (no token); the next tick asks again. */
  startSync: (settings: RelaySettings) => ShareSync | undefined;
  log: (message: string) => void;
  intervalMs?: number;
}

export interface RelaySupervisor<R> {
  current(): R | undefined;
  sync(): ShareSync | undefined;
  stop(): void;
}

const DEFAULT_INTERVAL_MS = 5_000;

export function createRelaySupervisor<R extends SupervisedRelay>(opts: RelaySupervisorOptions<R>): RelaySupervisor<R> {
  const { read, build, startSync, log } = opts;
  let relay: R | undefined;
  let sync: ShareSync | undefined;
  // The settings the running relay was built or last updated with, to tell what changed on the next tick.
  let last: RelaySettings | undefined;

  const onStateChange = (state: RelayState['state'], lastError?: string) => {
    log(`flow-tower: hub ${state}${lastError ? `: ${lastError}` : ''}`);
  };

  // Read at each heartbeat, not at build: the sync may start after the relay, and it may stop or go away.
  const shareErrors = (): string[] =>
    sync ? sync.state().filter((s) => s.error !== undefined).map((s) => s.name) : [];

  const stopAll = (reason: string) => {
    if (!relay && !sync) return;
    relay?.stop();
    sync?.stop();
    relay = undefined;
    sync = undefined;
    last = undefined;
    log(`flow-tower: sharing stopped (${reason})`);
  };

  const tick = () => {
    const reading = read();
    const url = reading.url;
    if (!reading.allowed || reading.role !== 'satellite' || !url) {
      stopAll('not a satellite');
      return;
    }
    const settings: RelaySettings = { url, token: reading.token, user: reading.user, machine: reading.machine, paused: reading.paused };
    // The relay as it stood before this tick: a rebuild below replaces it, and a rebuilt one is already current.
    const before = relay;

    if (!relay) {
      relay = build(settings, onStateChange, shareErrors);
      log(`flow-tower: connected to ${url} as ${settings.machine ?? 'this machine'}`);
    } else if (last && (last.user !== settings.user || last.machine !== settings.machine)) {
      // The identity is part of what the hub records per event, so a new one needs a new relay. The queue
      // of the old relay is dropped with it: events not yet sent under the old name are lost, by design.
      relay.stop();
      relay = build(settings, onStateChange, shareErrors);
      log(`flow-tower: connected to ${url} as ${settings.machine ?? 'this machine'} (queued events from the old name were dropped)`);
    } else if (last && (last.url !== settings.url || last.token !== settings.token)) {
      // Credentials only: the queue is kept and the relay flushes right away. The token is never logged.
      // Logged first, so the relay's own "hub online" line reads as the result of the change.
      log(`flow-tower: hub credentials changed (${url})`);
      relay.setCredentials({ url, token: settings.token });
    }

    // A relay built this tick already has the new `paused`; only an existing one needs the flip. Without this,
    // a config edit to `paused` would never reach the running relay until a restart.
    if (relay && relay === before && last && last.paused !== settings.paused) {
      if (settings.paused) {
        relay.pause();
        log('flow-tower: sharing paused');
      } else {
        relay.resume();
        log('flow-tower: sharing resumed');
      }
    }

    // The sync re-reads its own config each tick, so it only needs starting, not restarting, on a change.
    if (!sync) sync = startSync(settings);
    last = settings;
  };

  tick();
  const timer = setInterval(tick, opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  timer.unref();

  return {
    current: () => relay,
    sync: () => sync,
    stop: () => {
      clearInterval(timer);
      relay?.stop();
      sync?.stop();
      relay = undefined;
      sync = undefined;
      last = undefined;
    },
  };
}
