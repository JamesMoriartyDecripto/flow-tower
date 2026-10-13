import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorCount, glyph, hubPill } from '../src/app/hub';
import type { FlowEvent } from '../src/core/events';
import { hubCounts, machineRows } from '../src/server/machines';
import type { TokenInfo } from '../src/server/tokens';
import { cleanEnv } from './fixtures/clean-env';

/**
 * Hub signals that must agree with each other (#192-02): the chips, the pill, the duplicate-id refusal and
 * the audit trail of CLI changes. Only temp folders and the CLI child are used; no server is started.
 */
const CLI = join(import.meta.dirname, '..', 'src', 'cli', 'token.ts');

const ev = (over: Partial<FlowEvent>): FlowEvent =>
  ({ id: 'x', ts: 1, kind: 'log', source: 'test', targets: [], ...over }) as FlowEvent;

/** Runs `flow-tower token` in a temp home. The child inherits no FLOW_TOWER_* except the home it is given. */
function token(home: string, args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { env: cleanEnv({ FLOW_TOWER_HOME: home }), encoding: 'utf8', timeout: 20_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('live error chip count (#192-02 item 1)', () => {
  it('counts error events, by status or by kind, and ignores the rest', () => {
    const events = [
      ev({ id: 1, kind: 'tool.end', status: 'error' }),
      ev({ id: 2, kind: 'error' }),
      ev({ id: 3, kind: 'tool.end', status: 'ok' }),
      ev({ id: 4, kind: 'agent.start' }),
    ];
    expect(errorCount(events)).toBe(2);
    expect(errorCount([])).toBe(0);
  });
});

describe('feed glyph (#192-02 item 2)', () => {
  it('shows a failed tool.end as ✕, a finished one as ✓', () => {
    expect(glyph(ev({ kind: 'tool.end', status: 'error' }))).toBe('✕');
    expect(glyph(ev({ kind: 'tool.end' }))).toBe('✓');
    expect(glyph(ev({ kind: 'error' }))).toBe('✕');
  });
});

describe('HUB counter (#192-02 item 3)', () => {
  const now = 1_000_000_000;
  const tokenRow = (id: string, extra: Partial<TokenInfo> = {}): TokenInfo => ({ id, createdAt: now - 10_000, ...extra });

  it('counts only active senders on both sides of the slash', () => {
    // A revoked sender that spoke a minute ago is not "seen" and not a token.
    const rows = machineRows([
      tokenRow('a'),
      tokenRow('b', { revokedAt: now - 5_000 }),
      tokenRow('c', { paused: true }),
    ], [{ sender: 'b', queued: 0, dropped: 0, state: 'unknown', online: false, lastSeen: now - 60_000 } as never], now);
    expect(hubCounts(rows)).toEqual({ online: 0, tokens: 1 });
    expect(hubPill({ hub: true, ...hubCounts(rows) })).toBe('HUB 0/1');
  });
});

describe('duplicate token ids (#192-02 item 4)', () => {
  it('refuses an active or paused id with the exact message, and allows a revoked one', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-dup-'));
    expect(token(home, ['add', 'alice']).status).toBe(0);
    const again = token(home, ['add', 'alice']);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('a sender named alice exists: revoke it first, or pick another id');
    // A paused sender still exists: the same refusal.
    token(home, ['pause', 'alice']);
    expect(token(home, ['add', 'alice']).stderr).toContain('a sender named alice exists');
    // Once revoked the id is free again (rotation).
    token(home, ['revoke', 'alice']);
    expect(token(home, ['add', 'alice']).status).toBe(0);
  });
});

describe('CLI token changes are audited (#192-02 item 6)', () => {
  it('appends one line per change with via cli and no token text', () => {
    const home = mkdtempSync(join(tmpdir(), 'flow-tower-cli-audit-'));
    const added = token(home, ['add', 'carol']);
    const secret = added.stdout.split('\n')[0];
    token(home, ['pause', 'carol']);
    token(home, ['resume', 'carol']);
    token(home, ['revoke', 'carol']);
    const file = join(home, 'admin-audit.jsonl');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    const lines = text.trim().split('\n').map((l) => JSON.parse(l) as { action: string; target: string; detail?: { via?: string } });
    expect(lines.map((l) => l.action)).toEqual(['sender.add', 'sender.pause', 'sender.resume', 'sender.revoke']);
    expect(lines.every((l) => l.target === 'carol' && l.detail?.via === 'cli')).toBe(true);
    // The plaintext token is printed once and never written to the log.
    expect(secret.startsWith('ft_carol_')).toBe(true);
    expect(text).not.toContain(secret);
  });
});
