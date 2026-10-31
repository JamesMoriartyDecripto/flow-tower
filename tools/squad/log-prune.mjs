// Prunes the role logs that run.mjs writes beside itself (#357). Each run leaves <role>-<ms timestamp>.log and none was
// ever removed. The cost ledger is the lasting record; the logs are only for recent debugging, so the newest ones stay.
import { readdirSync, unlinkSync } from 'node:fs';

const LOG = /^[a-z-]+-(\d{13})\.log$/;
const DAY_MS = 86_400_000;

// A log is stale only when it is beyond the newest `keep` AND older than `maxAgeDays`: keeping whichever rule keeps more.
export function pickStale(names, now, { keep = 200, maxAgeDays = 14 } = {}) {
  const logs = names
    .flatMap((name) => { const m = LOG.exec(name); return m ? [{ name, ts: Number(m[1]) }] : []; })
    .sort((a, b) => b.ts - a.ts);
  return logs
    .slice(keep)
    .filter((l) => now - l.ts > maxAgeDays * DAY_MS)
    .map((l) => l.name);
}

// One file failing to go (locked, already gone) must not stop the rest, nor the run that called this.
export function pruneLogs(dir, now = Date.now(), opts) {
  let removed = 0;
  for (const name of pickStale(readdirSync(dir), now, opts)) {
    try { unlinkSync(`${dir}/${name}`); removed++; } catch { /* skipped */ }
  }
  return removed;
}
