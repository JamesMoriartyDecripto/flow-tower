/**
 * The hub admin audit log (#93): one JSON line per change the operator makes from the Hub panel, in the
 * user folder beside config.json. The file is append-only and owner-only: it records who did what, never
 * a token or a secret, so `target` is a sender id, a viewer login, a project or `hub`.
 *
 * Node only: the browser bundle never imports this.
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AuditEntry {
  ts: number;
  action: string;
  target: string;
  detail?: Record<string, unknown>;
}

/** What a caller passes in: the timestamp is stamped here, so no caller can backdate a line. */
export type AuditInput = Omit<AuditEntry, 'ts'>;

export const auditPath = (home: string) => join(home, 'admin-audit.jsonl');

/**
 * Appends one line. The folder is created owner-only when we make it, and the file is 0600 because the
 * operator's actions (which viewers were added, which senders were revoked) are not for other accounts.
 */
export function appendAudit(home: string, entry: AuditInput): void {
  if (!existsSync(home)) mkdirSync(home, { recursive: true, mode: 0o700 });
  const file = auditPath(home);
  const line: AuditEntry = { ts: Date.now(), ...entry };
  appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort: a filesystem that refuses chmod is not an error */ }
}

/**
 * The newest `limit` entries, newest first. A line that does not parse (a hand-edit, a torn write) is
 * skipped rather than failing the whole panel: the log is a record, not something a read may crash on.
 */
export function readAudit(home: string, limit = 50): AuditEntry[] {
  let text: string;
  try { text = readFileSync(auditPath(home), 'utf8'); } catch { return []; }
  const out: AuditEntry[] = [];
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    if (!lines[i]) continue;
    try {
      const parsed = JSON.parse(lines[i]) as Partial<AuditEntry>;
      if (typeof parsed.ts === 'number' && typeof parsed.action === 'string' && typeof parsed.target === 'string') {
        out.push(parsed as AuditEntry);
      }
    } catch { /* a bad line is skipped, the rest of the log still reads */ }
  }
  return out;
}
