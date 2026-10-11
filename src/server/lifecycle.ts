/**
 * Stops what a Vite plugin started when the dev server closes (#91, #99). Kept in its own file so it can
 * be unit-tested without importing plugin.ts (whose module top level reads the environment and warns about
 * FLOW_TOWER_HOME).
 *
 * Vite 8 restarts the server when a src/server file or the config changes, and every restart closes the
 * old server: without this hook, the old relay kept beating at the hub and its unref'd timers kept
 * the whole previous server alive, so memory grew across restarts (#99). The httpServer is optional (it is
 * undefined before listen, and in middleware mode), and then Vite's own close() is wrapped instead.
 */

/** The minimal shape this needs: an object that may expose an http server EventEmitter, and Vite's close. */
export interface CloseableServer {
  httpServer?: { once(event: 'close', listener: () => void): unknown } | null;
  /** Vite's own server.close(): the only close signal in middleware mode, where httpServer is missing. */
  close?: (...args: never[]) => unknown;
}

/**
 * Wire each cleanup to the first close of the dev server; returns the runner so a caller can also stop on
 * demand. With an httpServer, its 'close' event is the signal. Without one (middleware mode, or before
 * listen), that wiring would be a no-op and the relay would survive a restart, so Vite's own close() is
 * wrapped instead. `done` makes both signals idempotent: the cleanups must run exactly once.
 */
export function stopOnClose(server: CloseableServer, cleanups: (() => void)[]) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cleanups.forEach((c) => { try { c(); } catch { /* stopping must never throw */ } });
  };
  if (server.httpServer) {
    server.httpServer.once('close', run);
    return run;
  }
  const close = server.close;
  if (typeof close === 'function') {
    server.close = (...args: never[]) => { run(); return close.apply(server, args); };
  }
  return run;
}
