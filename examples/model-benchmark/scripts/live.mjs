// Live events for the benchmark's own tower (#105): the maintainer watches bench.mjs and judge.mjs run on
// examples/model-benchmark/model-benchmark.tower.yaml instead of reading the terminal afterwards.
//
//   const emit = live('http://127.0.0.1:5317');     // '' (no --url, no FLOW_TOWER_URL) means "no viewer"
//   emit({ kind: 'agent.start', node: 'runner.loop', model, session, message: 'coder/parse-edge run 1' });
//
// Metadata only: an event here never carries a prompt, an answer, a file's contents or the API key.
// A stopped or missing tower must never slow a benchmark down, so every POST is fire and forget.
const TIMEOUT_MS = 1500;

/**
 * `url` is the tower's base URL. Returns `emit(event)`, which POSTs one JSON event to `<url>/api/events`
 * and resolves even when nothing is listening: a viewer is a convenience, never a dependency.
 */
export function live(url) {
  const base = String(url ?? '').trim().replace(/\/+$/, '');
  if (!base) return () => Promise.resolve(); // no --url and no FLOW_TOWER_URL: the whole thing is a no-op
  const endpoint = `${base}/api/events`;
  return (event) => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The server matches and scopes by `tower`: both fields are what identifies this source in the feed.
    body: JSON.stringify({ tower: 'model-benchmark', source: 'model-benchmark', ts: Date.now(), ...event }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined);
}
