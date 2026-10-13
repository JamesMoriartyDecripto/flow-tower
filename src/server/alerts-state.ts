/**
 * The operator's acks and snoozes of the hub's alerts (#94), kept in <home>/alerts-state.json. Written the
 * way tokens.json is: a temp file and a rename, 0600, so a crash never leaves half a file. A missing or
 * hand-edited file reads as an empty state, never a crash.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pid } from 'node:process';
import { join } from 'node:path';
import type { AckState } from './alerts.ts';

const FILE = 'alerts-state.json';

/** Owner only, where we may decide it; a file system that refuses chmod (EPERM) is not an error. */
const ownerOnly = (path: string, mode: number) => { try { chmodSync(path, mode); } catch { /* best effort */ } };

/** A record of id to time, with anything that is not a finite number dropped. */
function timeRecord(v: unknown): Record<string, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === 'number' && Number.isFinite(t)));
}

export function readAlertState(home: string): AckState {
  let raw: Partial<Record<keyof AckState, unknown>>;
  try {
    const parsed = JSON.parse(readFileSync(join(home, FILE), 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { acked: {}, snoozed: {} };
    raw = parsed as Partial<Record<keyof AckState, unknown>>;
  } catch {
    return { acked: {}, snoozed: {} };
  }
  // Each key is read on its own: a bad `notified` must not discard the acks and snoozes next to it.
  const state: AckState = { acked: timeRecord(raw.acked), snoozed: timeRecord(raw.snoozed) };
  // Kept only when the file has it: a state written before the notifier stays the same shape it was.
  if (raw.notified !== undefined) state.notified = timeRecord(raw.notified);
  return state;
}

/**
 * Read-modify-write in one synchronous step: the file is read again right before it is written, so a write
 * from another path (the ticker, an ack POST) that landed since the caller last read it is kept, not lost.
 * No await in here, so no other code in this process can interleave between the read and the write.
 */
export function updateAlertState(home: string, change: (current: AckState) => AckState): AckState {
  const next = change(readAlertState(home));
  writeAlertState(home, next);
  return next;
}

export function writeAlertState(home: string, state: AckState): void {
  // Only a folder we create is ours to lock down; one the user chose is left as it is (like tokens.ts).
  if (!existsSync(home)) { mkdirSync(home, { recursive: true, mode: 0o700 }); ownerOnly(home, 0o700); }
  const file = join(home, FILE);
  const tmp = `${file}.${pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    // One retry for a Windows EPERM/EBUSY, the same as the token store: a rename can lose a race with a scanner.
    try { renameSync(tmp, file); } catch (err) {
      if (!['EPERM', 'EBUSY'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
      renameSync(tmp, file);
    }
    ownerOnly(file, 0o600);
  } finally {
    rmSync(tmp, { force: true });
  }
}
