/**
 * Types and timing constants of the satellite relay (#91). Kept apart from relay.ts so the send state
 * machine there stays readable; relay.ts re-exports the types, so importers are unchanged.
 */

/** Every hub request gives up after this long, so a hung hub cannot stall the relay forever. */
export const TIMEOUT_MS = 5_000;
/** Never more than one flush a second; a failing hub waits longer (1 s, 2 s, 4 s … max 60 s). */
export const MIN_GAP_MS = 1_000;
export const MAX_BACKOFF_MS = 60_000;
/** How often a satellite tells the hub it is alive (#91): the hub calls it offline after three of these. */
export const HEARTBEAT_MS = 60_000;
/** While refused or held, how often one heartbeat asks the hub whether the machine is accepted again. */
export const RECHECK_MS = 30_000;

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
  /** How long a refused or held relay waits before its next recheck. Injectable for tests. */
  recheckMs?: number;
  /** Called only when the state word changes. It never receives the token, only the word and the last error. */
  onStateChange?: (state: RelayState['state'], lastError?: string) => void;
}

export interface RelayState {
  state: 'online' | 'queued' | 'revoked' | 'held' | 'paused';
  hub: string;
  queued: number;
  dropped: number;
  /** Events thrown away by a pause (#91): they were in the queue and will never leave. Shown nowhere else. */
  discardedOnPause: number;
  lastSentAt?: number;
  lastError?: string;
  /** The last event that actually left this machine, after the content was stripped: never the token. */
  lastPayload?: Record<string, unknown>;
}

/** New hub credentials, as the user supplies them after a refusal (step 4). The token never reaches `state()`. */
export interface RelayCredentials {
  url: string;
  token?: string;
}
