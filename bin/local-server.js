/**
 * The local server record (#187): a running `serve` writes its url and pid into the user folder, so `emit`
 * and `simulate` find its port without a --url. Plain JS, like config-file.js, because `emit` runs on every
 * hook call and must not start a second Node just to read this file.
 *
 * Known limits: a pid reused by another process reads as alive, so the record then names a dead url until
 * that process ends. `emit` never falls back to 5317 on its own, on purpose: another server may listen there.
 * Two servers starting in the same instant may both write the record; the last one wins.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readObject } from './config-file.js';

/**
 * Where a running `serve` listens (#187): it writes this file into the user folder so `emit` and `simulate`
 * find its port without a --url. Plain JS for the same reason as the rest of this file.
 */
export const localServerFile = (home) => join(home, 'local-server.json');

const userHome = (env) => env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower');

/** Records the url of a server this process runs. Never throws: without the file, emit uses the default port. */
export function writeLocalServer({ home = userHome(process.env), url, pid }) {
  try {
    mkdirSync(home, { recursive: true });
    // The file names a local port and a pid, nothing secret, but it is still the user's own: owner only.
    writeFileSync(localServerFile(home), JSON.stringify({ url, pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch { /* read-only home: emit falls back to the default url */ }
}

/**
 * Removes the record only when it is still this process's: a second server may have written its own
 * since. Never throws.
 */
export function clearLocalServer({ home = userHome(process.env), pid }) {
  try {
    if (readObject(localServerFile(home)).pid === pid) rmSync(localServerFile(home), { force: true });
  } catch { /* nothing to clear */ }
}

/**
 * The url of a local server this user folder recorded, when its pid is still alive. A stale file (the
 * server was killed without cleanup) reads as undefined, so emit falls back to the default.
 */
export function localServerUrl({ env = process.env, home = userHome(env) } = {}) {
  const record = readObject(localServerFile(home));
  if (typeof record.url !== 'string' || !record.url.trim() || !Number.isInteger(record.pid)) return undefined;
  try {
    process.kill(record.pid, 0);
  } catch (err) {
    // EPERM: the process exists but belongs to someone else, so it is alive for our purposes.
    if (err?.code !== 'EPERM') return undefined;
  }
  return record.url.trim();
}

/**
 * Records where this server listens, then clears the record on exit. Called once `serve` is listening.
 * The first live server keeps the record: a second one in the same user folder would otherwise take it over,
 * then clear it on exit and leave emit with no record while the first still runs.
 */
export function recordLocalServer({ env, bindHost, port }) {
  // A wildcard bind is reached on loopback; IPv6 literals need brackets in a URL.
  const recordHost = bindHost === '0.0.0.0' || bindHost === '::' ? '127.0.0.1' : bindHost.includes(':') ? `[${bindHost}]` : bindHost;
  const localUrl = `http://${recordHost}:${port}`;
  if (!localServerUrl({ env })) writeLocalServer({ url: localUrl, pid: process.pid });
  // Clearing on exit keeps the record from naming a dead port; the signal handlers only add the clear, then exit
  // with the conventional code (Node's default for these signals, which a handler would otherwise replace).
  process.on('exit', () => clearLocalServer({ pid: process.pid }));
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.once(sig, () => { clearLocalServer({ pid: process.pid }); process.exit(code); });
  }
}
