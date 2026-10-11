/**
 * Stops what a Vite plugin started when the dev server closes (#91, #99). Kept in its own file so it can
 * be unit-tested without importing plugin.ts (whose module top level reads the environment and warns about
 * FLOW_TOWER_HOME).
 *
 * Vite 8 restarts the server when a src/server file or the config changes, and every restart closes the
 * old http server: without this hook, the old relay kept beating at the hub and its unref'd timers kept
 * the whole previous server alive, so memory grew across restarts (#99). The httpServer is optional (it is
 * undefined before listen), so the wiring is a no-op then.
 */

/** The minimal shape this needs: an object that may expose an http server EventEmitter. */
export interface CloseableServer {
  httpServer?: { once(event: 'close', listener: () => void): unknown } | null;
}

/** Wire each cleanup to the server's 'close' event; returns the runner so a caller can also stop on demand. */
export function stopOnClose(server: CloseableServer, cleanups: (() => void)[]) {
  const run = () => cleanups.forEach((c) => { try { c(); } catch { /* stopping must never throw */ } });
  server.httpServer?.once('close', run);
  return run;
}
