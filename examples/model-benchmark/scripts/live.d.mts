/** Types for scripts/live.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

/** One live event for the tower; metadata only. Unknown keys travel as-is (the server keeps them in `data`). */
export interface LiveEvent {
  kind: 'session.start' | 'session.end' | 'prompt' | 'agent.start' | 'agent.end' | 'tool.start' | 'tool.end' | 'error' | 'log' | 'usage';
  [key: string]: unknown;
}

/**
 * `url` is the tower's base URL ('' = no viewer). Returns `emit`, which POSTs one event to
 * `<url>/api/events` and always resolves: a missing tower never slows or fails a benchmark.
 */
export function live(url?: string): (event: LiveEvent) => Promise<void>;
