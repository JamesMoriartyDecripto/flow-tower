import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { childEnv } from '../examples/dev-squad/src/child-env.ts';
import { BodyTooLarge, MAX_WEBHOOK_BYTES, readCappedBody, verifySignature } from '../examples/dev-squad/src/http-body.ts';
import { hasPushAccess, selectDecision, type IssueComment } from '../examples/dev-squad/src/loop/approval-select.ts';
import { awaitApproval, type ApprovalDeps } from '../examples/dev-squad/src/loop/await-approval.ts';
import { runSuite, type Exec } from '../examples/dev-squad/src/tools/run-suite.ts';

async function* chunksOf(...parts: (Buffer | string)[]) {
  for (const p of parts) yield p;
}

describe('run-suite: credentials and stale reports', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'sdk-sec-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('runs the child with the allowlisted env only, with a scratch HOME (no real secrets used)', async () => {
    const saved = { ...process.env };
    process.env.FAKE_SQUAD_TOKEN = 'placeholder-not-a-secret';
    process.env.OPENROUTER_API_KEY = 'placeholder-not-a-secret';
    const seen: NodeJS.ProcessEnv[] = [];
    const exec: Exec = async (_f, _a, o) => { seen.push(o.env); };
    try {
      await runSuite({ cwd: dir, args: ['vitest'], reportFile: join(dir, 'r.json'), home: '/scratch', exec });
    } finally {
      process.env = saved;
    }
    expect(seen[0]).not.toHaveProperty('FAKE_SQUAD_TOKEN');
    expect(seen[0]).not.toHaveProperty('OPENROUTER_API_KEY');
    expect(seen[0].HOME).toBe('/scratch');
  });

  it('removes a stale report before invoking the runner, so a crash cannot report a pass', async () => {
    const report = join(dir, 'r.json');
    await writeFile(report, JSON.stringify({ numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, testResults: [] }));
    let existedDuringRun = true;
    const exec: Exec = async () => { existedDuringRun = await readFile(report, 'utf8').then(() => true, () => false); throw new Error('crash'); };
    const result = await runSuite({ cwd: dir, args: ['vitest'], reportFile: report, home: '/s', exec });
    expect(existedDuringRun).toBe(false);
    expect(result).toBeNull();
  });

  it('returns the fresh report when the runner writes one', async () => {
    const report = join(dir, 'r.json');
    const exec: Exec = async () => { await writeFile(report, JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, testResults: [] })); };
    const result = await runSuite({ cwd: dir, args: ['vitest'], reportFile: report, home: '/s', exec });
    expect(result?.numPassedTests).toBe(2);
  });

  it('childEnv still drops inherited secrets for the same input shape', () => {
    const env = childEnv({ PATH: '/bin', GH_TOKEN: 'x', NPM_TOKEN: 'x' }, '/h');
    expect(env).not.toHaveProperty('GH_TOKEN');
    expect(env).not.toHaveProperty('NPM_TOKEN');
  });
});

describe('webhook body cap', () => {
  it('accepts a body exactly at the limit and rejects one byte over', async () => {
    const atLimit = Buffer.alloc(MAX_WEBHOOK_BYTES, 0x61);
    expect((await readCappedBody(chunksOf(atLimit))).length).toBe(MAX_WEBHOOK_BYTES);
    const over = Buffer.alloc(MAX_WEBHOOK_BYTES + 1, 0x61);
    await expect(readCappedBody(chunksOf(over))).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it('counts raw bytes across chunks, not characters', async () => {
    // Each "€" is 3 bytes; 333_334 of them is 1_000_002 bytes but only 333_334 UTF-16 units.
    const euro = '€'.repeat(333_334);
    await expect(readCappedBody(chunksOf(euro))).rejects.toBeInstanceOf(BodyTooLarge);
    const ok = '€'.repeat(333_333); // 999_999 bytes
    expect((await readCappedBody(chunksOf(ok))).toString('utf8')).toBe(ok);
  });

  it('stops buffering at the first chunk that crosses the limit', async () => {
    const pulled = vi.fn();
    async function* stream() {
      for (let i = 0; i < 100; i++) { pulled(i); yield Buffer.alloc(400_000, 0x62); }
    }
    await expect(readCappedBody(stream())).rejects.toBeInstanceOf(BodyTooLarge);
    expect(pulled.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('joins chunks split mid-character and decodes once', async () => {
    const full = Buffer.from('héllo ✓', 'utf8');
    const body = await readCappedBody(chunksOf(full.subarray(0, 2), full.subarray(2)));
    expect(body.toString('utf8')).toBe('héllo ✓');
  });

  it('propagates read errors to the caller instead of leaving them unhandled', async () => {
    async function* broken() {
      yield Buffer.from('partial');
      throw new Error('socket reset');
    }
    await expect(readCappedBody(broken())).rejects.toThrow('socket reset');
  });

  it('verifies the HMAC over raw bytes, so invalid UTF-8 still signs and checks', () => {
    const raw = Buffer.from([0xff, 0xfe, 0x00, 0x41]);
    const secret = 'placeholder-webhook-secret';
    const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verifySignature(raw, sig, secret)).toBe(true);
    expect(verifySignature(raw, sig, 'other')).toBe(false);
    expect(verifySignature(raw, undefined, secret)).toBe(false);
    expect(verifySignature(raw, sig, undefined)).toBe(false);
  });
});

describe('approval selection', () => {
  const since = new Date('2026-01-01T00:00:00Z');
  const c = (login: string | undefined, body: string, at = '2026-01-02T00:00:00Z'): IssueComment =>
    ({ body, created_at: at, user: login === undefined ? null : { login } });
  const writer = async (login: string) => login === 'maintainer';

  it('ignores a command from a user without push access and selects the authorized one', async () => {
    const comments = [
      c('maintainer', '/squad revise older', '2026-01-02T01:00:00Z'),
      c('outsider', '/squad approve sneaky', '2026-01-02T05:00:00Z'),
    ];
    expect(await selectDecision(comments, since, writer)).toEqual({ kind: 'revise', notes: 'older' });
  });

  it('fails closed when the permission lookup errors', async () => {
    const comments = [c('maintainer', '/squad approve')];
    const failing = async () => { throw new Error('HTTP 500'); };
    expect(await selectDecision(comments, since, failing)).toBeUndefined();
  });

  it('never authorizes a comment without a login', async () => {
    expect(await selectDecision([c(undefined, '/squad approve')], since, writer)).toBeUndefined();
  });

  it('ignores commands at or before the request time', async () => {
    expect(await selectDecision([c('maintainer', '/squad approve', '2026-01-01T00:00:00Z')], since, writer)).toBeUndefined();
  });

  it('reads push from either permission shape and rejects read or triage', () => {
    expect(hasPushAccess({ permission: 'write' })).toBe(true);
    expect(hasPushAccess({ permission: 'maintain' })).toBe(true);
    expect(hasPushAccess({ permission: 'admin' })).toBe(true);
    expect(hasPushAccess({ permissions: { push: true } })).toBe(true);
    expect(hasPushAccess({ permission: 'read' })).toBe(false);
    expect(hasPushAccess({ permission: 'triage' })).toBe(false);
    expect(hasPushAccess(null)).toBe(false);
  });
});

describe('awaitApproval with injected gh', () => {
  const issue = { repo: 'acme/shop', number: 7, title: 't', body: '', labels: [] };
  const since = new Date(Date.now() - 60_000);

  function deps(opts: { labels?: string[]; pages: IssueComment[][]; permissions: Record<string, string>; events?: unknown[][] }) {
    const calls: string[][] = [];
    const gh = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'issue') return JSON.stringify({ labels: (opts.labels ?? []).map((name) => ({ name })) });
      if (args[1]?.endsWith('/comments')) return JSON.stringify(opts.pages);
      if (args[1]?.endsWith('/events')) return JSON.stringify(opts.events ?? []);
      const login = /collaborators\/([^/]+)\/permission/.exec(args[1])![1];
      if (!(login in opts.permissions)) throw new Error('404');
      return JSON.stringify({ permission: opts.permissions[login] });
    });
    const wait = vi.fn(async () => undefined);
    const d: ApprovalDeps = { gh, wait, now: () => Date.now() };
    return { d, wait, calls };
  }

  it('approves when a writer comments /squad approve, with no sleep', async () => {
    const { d, wait } = deps({
      pages: [[{ body: '/squad approve ship it', created_at: new Date().toISOString(), user: { login: 'maintainer' } }]],
      permissions: { maintainer: 'write' },
    });
    expect(await awaitApproval(issue, since, d)).toEqual({ kind: 'approved', notes: 'ship it' });
    expect(wait).not.toHaveBeenCalled();
  });

  it('keeps polling past an outsider command, then times out without authorization', async () => {
    // The fake clock jumps past the deadline on the first wait, so the loop ends without real time passing.
    let t = 0;
    const { d, wait } = deps({
      pages: [[{ body: '/squad approve', created_at: new Date().toISOString(), user: { login: 'outsider' } }]],
      permissions: { outsider: 'read' },
    });
    wait.mockImplementation(async () => { t = Number.MAX_SAFE_INTEGER; });
    expect(await awaitApproval(issue, new Date(0), { ...d, now: () => t })).toEqual({ kind: 'timeout' });
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('accepts the squad:approved label from repo writers without a comment', async () => {
    const fresh = new Date().toISOString();
    const events = [[{ event: 'labeled', created_at: fresh, actor: { login: 'maintainer' }, label: { name: 'squad:approved' } }]];
    const { d } = deps({ labels: ['squad:approved'], pages: [], permissions: { maintainer: 'write' }, events });
    expect(await awaitApproval(issue, since, d)).toEqual({ kind: 'approved' });
  });
});
