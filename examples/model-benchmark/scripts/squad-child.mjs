// The one place a benchmark driver spawns tools/squad/run.mjs and reads what it left behind (#447).
// The drivers share the child runner, the resume read and the worker pool, so a fix lands once, here.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

// Port 9 has no listener, so the runner's live events fail fast and no tower the user has open receives benchmark events.
const NO_EVENTS = 'http://127.0.0.1:9';

// The last ledger line holds this run's outcome and cost; no line means the runner died before recording.
// A last line cut by a kill counts as no line, so that run is scored as a crash instead of stopping the driver.
function lastLedgerLine(path) {
  let text = '';
  try { text = readFileSync(path, 'utf8'); } catch { return null; }
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

// Each run gets its own ledger in tmp, so the benchmark never adds to the user's cost ledger.
export function runSquad({ runMjs, args, timeoutS, tmp }) {
  const ledger = join(tmp, `${randomUUID()}.jsonl`);
  const t0 = Date.now();
  return new Promise((ok) => {
    const child = spawn(process.execPath, [runMjs, ...args], {
      env: { ...env, SQUAD_LEDGER: ledger, FLOW_TOWER_URL: NO_EVENTS },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutS * 1000);
    child.on('close', () => {
      clearTimeout(timer);
      const rec = lastLedgerLine(ledger);
      const outcome = timedOut ? 'timeout' : rec ? rec.outcome : 'crash';
      ok({ stdout, rec, outcome, seconds: Math.round((Date.now() - t0) / 100) / 10 });
    });
  });
}

// A torn last line after an interrupted append must not drop the finished jobs before it, so each line is parsed alone.
export function doneSet(outFile, keyOf) {
  let text = '';
  try { text = readFileSync(outFile, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const done = new Set();
  let skipped = 0;
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    let line;
    try { line = JSON.parse(l); } catch { skipped++; continue; }
    done.add(keyOf(line));
  }
  if (skipped) console.log(`skipped ${skipped} unreadable lines in ${outFile}`);
  return done;
}

export async function pool(items, parallel, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, worker));
}
