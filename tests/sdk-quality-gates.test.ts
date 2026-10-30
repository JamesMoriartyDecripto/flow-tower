import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Only the SDK-backed boundaries are mocked: run-agent (the SDK query), agent files and prompt
// rendering. reviewLoop and verify run for real, so their control flow and gates are what is tested.
const h = vi.hoisted(() => ({
  runAgent: vi.fn(),
  renderPrompt: vi.fn(() => 'prompt'),
  loadAgentFiles: vi.fn(() => ({
    coder: { prompt: 'c' }, reviewer: { prompt: 'r' }, 'security-auditor': { prompt: 's' }, verifier: { prompt: 'v' },
  })),
}));

vi.mock('../examples/dev-squad/src/run-agent.ts', () => ({
  runAgent: h.runAgent,
  // Same parsing as the real helper: the last JSON object in the reply.
  lastJson: (text: string) => {
    const match = text.match(/\{[\s\S]*\}/g)?.at(-1);
    if (!match) throw new Error(`expected JSON, got: ${text.slice(0, 200)}`);
    return JSON.parse(match);
  },
}));
vi.mock('../examples/dev-squad/src/prompts.ts', () => ({ renderPrompt: h.renderPrompt }));
vi.mock('../examples/dev-squad/src/agents.ts', () => ({ loadAgentFiles: h.loadAgentFiles }));

// Local types: the modules are loaded dynamically, so their types stay out of the host typecheck.
interface AgentRun { text: string; costUsd: number; sessionId: string; ok: boolean }
interface Finding { file: string; line: number; issue: string; fix: string; severity?: string }
interface LoopResult { outcome: 'approved' | 'escalate'; rounds: number; costUsd: number; followUps: string[]; open: Finding[]; seen: Finding[] }
interface Verification { verdict: 'ship' | 'hold'; criteria: { text: string; met: boolean; evidence: string }[]; suite: string; gaps: string[]; costUsd: number }

const loopPath = '../examples/dev-squad/src/loop/review-loop.ts';
const verifyPath = '../examples/dev-squad/src/loop/verify.ts';
const configPath = '../examples/dev-squad/src/config.ts';
const { reviewLoop } = (await import(loopPath)) as { reviewLoop: (i: number, p: string, wt: { path: string; branch: string }) => Promise<LoopResult> };
const { verify } = (await import(verifyPath)) as { verify: (i: number, wt: { path: string; branch: string }) => Promise<Verification> };
const { REVIEW } = (await import(configPath)) as { REVIEW: { maxRounds: number } };

const wt = { path: '/tmp/wt/1', branch: 'squad/1-x' };
const ok = (text: string, costUsd = 0.1): AgentRun => ({ text, costUsd, sessionId: 's', ok: true });
const failed = (text: string, costUsd = 0.1): AgentRun => ({ text, costUsd, sessionId: 's', ok: false });
const APPROVE = JSON.stringify({ verdict: 'approve', blocking: [], follow_ups: [] });
const SEC_PASS = JSON.stringify({ verdict: 'pass', findings: [] });
const BLOCK_CRIT: Finding = { file: 'a.ts', line: 3, issue: 'sql injection', fix: 'parameterize', severity: 'critical' };
const CHANGES = JSON.stringify({ verdict: 'changes_requested', blocking: [{ file: 'b.ts', line: 9, issue: 'off by one', fix: 'use <=' }], follow_ups: [] });

// Per-role answers in call order. Rounds consume one entry per call; an exhausted queue fails the test loudly.
let queues: Record<string, AgentRun[]>;
const callsFor = (role: string) => (h.runAgent as Mock).mock.calls.filter(([, , opts]) => (opts as { role: string }).role === role);

beforeEach(() => {
  (h.runAgent as Mock).mockReset();
  (h.renderPrompt as Mock).mockClear();
  queues = { reviewer: [], 'security-auditor': [], coder: [], verifier: [] };
  (h.runAgent as Mock).mockImplementation(async (_agent: unknown, _prompt: string, opts: { role: string }) => {
    const next = queues[opts.role]?.shift();
    if (!next) throw new Error(`unexpected ${opts.role} call`);
    return next;
  });
});

describe('reviewLoop: unsuccessful evaluators never count as approval', () => {
  it('a failed reviewer whose text holds approving JSON throws, with no fixer and no approval', async () => {
    queues.reviewer = [failed(APPROVE)];
    queues['security-auditor'] = [ok(SEC_PASS)];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/reviewer did not finish/);
    expect(callsFor('coder')).toHaveLength(0);
    expect(callsFor('reviewer')).toHaveLength(1);
  });

  it('a failed security audit whose text holds passing JSON throws, with no fixer', async () => {
    queues.reviewer = [ok(APPROVE)];
    queues['security-auditor'] = [failed(SEC_PASS)];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/security-auditor did not finish/);
    expect(callsFor('coder')).toHaveLength(0);
  });

  it('a failed fixer stops the loop: no second review round can erase the failure', async () => {
    queues.reviewer = [ok(CHANGES), ok(APPROVE)];
    queues['security-auditor'] = [ok(SEC_PASS), ok(SEC_PASS)];
    queues.coder = [failed('tool loop exhausted', 0.4)];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/coder did not finish the fix for round 1/);
    expect(callsFor('reviewer')).toHaveLength(1);
    expect(callsFor('security-auditor')).toHaveLength(1);
    expect(callsFor('coder')).toHaveLength(1);
  });
});

describe('reviewLoop: negative verdicts and malformed replies fail closed', () => {
  it('changes_requested with no blocking finding throws instead of approving silently', async () => {
    queues.reviewer = [ok(JSON.stringify({ verdict: 'changes_requested', blocking: [], follow_ups: [] }))];
    queues['security-auditor'] = [ok(SEC_PASS)];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/without a blocking finding/);
    expect(callsFor('coder')).toHaveLength(0);
  });

  it('a security block with no critical or high finding throws instead of approving silently', async () => {
    queues.reviewer = [ok(APPROVE)];
    queues['security-auditor'] = [ok(JSON.stringify({ verdict: 'block', findings: [{ file: 'c.ts', line: 1, issue: 'nit', fix: 'x', severity: 'low' }] }))];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/without a critical or high finding/);
    expect(callsFor('coder')).toHaveLength(0);
  });

  it('a reviewer reply without a blocking array fails clearly', async () => {
    queues.reviewer = [ok(JSON.stringify({ verdict: 'approve', follow_ups: [] }))];
    queues['security-auditor'] = [ok(SEC_PASS)];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/invalid shape/);
  });

  it('invalid JSON from a reviewer throws before any fixer', async () => {
    queues.reviewer = [ok('looks good to me')];
    queues['security-auditor'] = [ok(SEC_PASS)];
    await expect(reviewLoop(1, 'plan', wt)).rejects.toThrow(/expected JSON/);
    expect(callsFor('coder')).toHaveLength(0);
  });
});

describe('reviewLoop: successful paths keep their contracts', () => {
  it('red review, successful fix, then green approves in round two with all cost summed', async () => {
    queues.reviewer = [ok(CHANGES, 0.2), ok(APPROVE, 0.2)];
    queues['security-auditor'] = [ok(SEC_PASS, 0.1), ok(SEC_PASS, 0.1)];
    queues.coder = [ok('fixed', 0.5)];
    const result = await reviewLoop(1, 'plan', wt);
    expect(result).toMatchObject({ outcome: 'approved', rounds: 2 });
    expect(result.costUsd).toBeCloseTo(1.1, 5);
    expect(result.seen).toHaveLength(1);
    expect(callsFor('coder')).toHaveLength(1);
  });

  it('a critical security block is fixed and carried into the next round as previous findings', async () => {
    queues.reviewer = [ok(APPROVE), ok(APPROVE)];
    queues['security-auditor'] = [ok(JSON.stringify({ verdict: 'block', findings: [BLOCK_CRIT] })), ok(SEC_PASS)];
    queues.coder = [ok('fixed')];
    expect(await reviewLoop(1, 'plan', wt)).toMatchObject({ outcome: 'approved', rounds: 2 });
    expect(h.renderPrompt).toHaveBeenCalledWith('review-round', expect.objectContaining({ previous_findings: expect.stringContaining('sql injection') }));
  });

  it('low-severity security findings become follow-ups without blocking', async () => {
    const low = { file: 'd.ts', line: 2, issue: 'weak hash', fix: 'x', severity: 'low' };
    queues.reviewer = [ok(APPROVE)];
    queues['security-auditor'] = [ok(JSON.stringify({ verdict: 'pass', findings: [low] }))];
    const result = await reviewLoop(1, 'plan', wt);
    expect(result).toMatchObject({ outcome: 'approved', rounds: 1 });
    expect(result.followUps).toEqual(['d.ts:2 weak hash']);
    expect(callsFor('coder')).toHaveLength(0);
  });

  it('a round that never converges escalates at the max round with no extra fixer call', async () => {
    for (let i = 0; i < REVIEW.maxRounds; i++) {
      queues.reviewer.push(ok(CHANGES));
      queues['security-auditor'].push(ok(SEC_PASS));
    }
    for (let i = 0; i < REVIEW.maxRounds - 1; i++) queues.coder.push(ok('fixed'));
    const result = await reviewLoop(1, 'plan', wt);
    expect(result).toMatchObject({ outcome: 'escalate', rounds: REVIEW.maxRounds });
    expect(callsFor('coder')).toHaveLength(REVIEW.maxRounds - 1);
  });
});

describe('verify: an unsuccessful or unproven verifier never ships', () => {
  const met = [{ text: 'typo fixed', met: true, evidence: 'diff' }];

  it('an unsuccessful verifier run holds, even when its text says ship', async () => {
    queues.verifier = [failed(JSON.stringify({ verdict: 'ship', criteria: met, suite: 'green', gaps: [] }))];
    const v = await verify(1, wt);
    expect(v.verdict).toBe('hold');
    expect(v.suite).toBe('red');
  });

  it('a red suite holds even when the model says ship with met criteria', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', criteria: met, suite: 'red', gaps: [] }))];
    const v = await verify(1, wt);
    expect(v.verdict).toBe('hold');
    expect(v.gaps).toContain('suite is red');
  });

  it('an unmet criterion holds even when the model says ship', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', criteria: [...met, { text: 'tests added', met: false, evidence: '' }], suite: 'green', gaps: [] }))];
    const v = await verify(1, wt);
    expect(v.verdict).toBe('hold');
    expect(v.gaps).toContain('unmet: tests added');
  });

  it('empty acceptance criteria are not accepted as fully verified', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', criteria: [], suite: 'green', gaps: [] }))];
    const v = await verify(1, wt);
    expect(v.verdict).toBe('hold');
    expect(v.gaps).toContain('no acceptance criteria were verified');
  });

  it('explicit gaps hold even when every criterion is met and the suite is green', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', criteria: met, suite: 'green', gaps: ['no test for empty input'] }))];
    const v = await verify(1, wt);
    expect(v.verdict).toBe('hold');
    expect(v.gaps).toEqual(['no test for empty input']);
  });

  it('an unknown suite value holds instead of counting as green', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', criteria: met, suite: 'pending', gaps: [] }))];
    const v = await verify(1, wt);
    expect(v.verdict).toBe('hold');
    expect(v.gaps.join(' ')).toContain('unknown');
  });

  it('a reply without a criteria array fails clearly instead of shipping', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', suite: 'green', gaps: [] }))];
    await expect(verify(1, wt)).rejects.toThrow(/invalid shape/);
  });

  it('valid nonempty met criteria, green suite and no gaps ship', async () => {
    queues.verifier = [ok(JSON.stringify({ verdict: 'ship', criteria: met, suite: 'green', gaps: [] }), 0.2)];
    const v = await verify(1, wt);
    expect(v).toMatchObject({ verdict: 'ship', suite: 'green', gaps: [], costUsd: 0.2 });
  });
});
