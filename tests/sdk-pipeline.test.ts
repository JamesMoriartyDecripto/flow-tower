import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Host has no @anthropic-ai/claude-agent-sdk, so every SDK-backed boundary is mocked BEFORE the
// pipeline loads. Git and gh are recorded, never executed: the fake execFile never spawns.
const h = vi.hoisted(() => {
  const execCalls: string[] = [];
  const fakeExec = Object.assign(
    function execFile(): never { throw new Error('real execFile must not run in tests'); },
    {
      [Symbol.for('nodejs.util.promisify.custom')]: async (file: string, args: string[]) => {
        execCalls.push([file, ...args].join(' '));
        return { stdout: '', stderr: '' };
      },
    },
  );
  return {
    execCalls,
    fakeExec,
    triage: vi.fn(),
    runLead: vi.fn(),
    runAgent: vi.fn(),
    reviewLoop: vi.fn(),
    verify: vi.fn(),
    awaitApproval: vi.fn(),
    appendRun: vi.fn(),
    promoteRecurring: vi.fn(() => 0),
    openPrHandler: vi.fn(),
    requestHandler: vi.fn(),
    loadAgentFiles: vi.fn(() => ({ coder: {}, 'doc-writer': {}, verifier: {}, reviewer: {}, 'security-auditor': {} })),
  };
});

vi.mock('node:child_process', () => ({ execFile: h.fakeExec }));
vi.mock('../examples/dev-squad/src/agents.ts', () => ({ loadAgentFiles: h.loadAgentFiles }));
vi.mock('../examples/dev-squad/src/triage.ts', () => ({ triage: h.triage }));
vi.mock('../examples/dev-squad/src/orchestrator.ts', () => ({ runLead: h.runLead }));
vi.mock('../examples/dev-squad/src/run-agent.ts', () => ({ runAgent: h.runAgent }));
vi.mock('../examples/dev-squad/src/loop/review-loop.ts', () => ({ reviewLoop: h.reviewLoop }));
vi.mock('../examples/dev-squad/src/loop/verify.ts', () => ({ verify: h.verify }));
vi.mock('../examples/dev-squad/src/loop/await-approval.ts', () => ({ awaitApproval: h.awaitApproval }));
vi.mock('../examples/dev-squad/src/memory/session-log.ts', () => ({ appendRun: h.appendRun }));
vi.mock('../examples/dev-squad/src/memory/store.ts', () => ({ promoteRecurring: h.promoteRecurring }));
vi.mock('../examples/dev-squad/src/tools/open-pr.ts', () => ({ openPr: () => ({ handler: h.openPrHandler }) }));
vi.mock('../examples/dev-squad/src/tools/request-approval.ts', () => ({ requestApproval: () => ({ handler: h.requestHandler }) }));

// Local types: the pipeline module is never statically imported, so its types stay out of the host typecheck.
type Outcome = 'pr_open' | 'rejected' | 'needs_info' | 'blocked' | 'escalated' | 'failed' | 'over_budget';
type Issue = { repo: string; number: number; title: string; body: string; labels: string[] };
type Route = 'quickfix' | 'full' | 'needs_info' | 'reject';
interface AgentRun { text: string; costUsd: number; sessionId: string; ok: boolean }
interface LeadReport { status: 'ready_for_review' | 'blocked' | 'awaiting_approval'; plan: string; notes: string; sessionId: string; costUsd: number }

const pipelinePath = '../examples/dev-squad/src/pipeline.ts';
const { deliver } = (await import(pipelinePath)) as { deliver: (issue: Issue) => Promise<Outcome> };

const issue: Issue = { repo: 'acme/shop', number: 412, title: 'Fix typo', body: 'It says teh.', labels: [] };
const okRun = (costUsd: number, text = 'done'): AgentRun => ({ text, costUsd, sessionId: 'a1', ok: true });
const failRun = (costUsd: number, text: string): AgentRun => ({ text, costUsd, sessionId: 'a1', ok: false });
const triageFor = (route: Route) => ({ kind: 'bug', complexity: 1, route, risk: 'low', areas: ['web'], questions: ['what page?'], rationale: 'why' });
const lead = (over: Partial<LeadReport> = {}): LeadReport => ({ status: 'ready_for_review', plan: 'Plan P', notes: '', sessionId: 'L1', costUsd: 1, ...over });
const PR_URL = 'https://github.com/acme/shop/pull/77';
const prOpenOk = { content: [{ type: 'text', text: PR_URL }] };

// Per-role provider answers, reset before each test. A role mapped to an Error throws, like a crashed SDK call.
let roles: Record<string, AgentRun | Error>;

beforeEach(() => {
  for (const f of [h.triage, h.runLead, h.runAgent, h.reviewLoop, h.verify, h.awaitApproval, h.appendRun, h.openPrHandler, h.requestHandler]) (f as Mock).mockReset();
  h.promoteRecurring.mockReset().mockReturnValue(0);
  h.execCalls.length = 0;
  roles = { coder: okRun(0.5), 'doc-writer': okRun(0.1) };
  (h.runAgent as Mock).mockImplementation(async (_agent: unknown, _prompt: string, opts: { role: string }) => {
    const r = roles[opts.role];
    if (r instanceof Error) throw r;
    return r ?? okRun(0);
  });
  (h.triage as Mock).mockResolvedValue(triageFor('quickfix'));
  (h.runLead as Mock).mockResolvedValue(lead());
  (h.reviewLoop as Mock).mockResolvedValue({ outcome: 'approved', rounds: 1, costUsd: 0.3, followUps: [], open: [], seen: [] });
  (h.verify as Mock).mockResolvedValue({ verdict: 'ship', criteria: [{ text: 'typo fixed', met: true, evidence: 'diff' }], suite: 'green', gaps: [], costUsd: 0.2 });
  (h.awaitApproval as Mock).mockResolvedValue({ kind: 'approved' });
  h.openPrHandler.mockResolvedValue(prOpenOk);
  h.requestHandler.mockResolvedValue({ content: [{ type: 'text', text: 'requested' }] });
});

const journal = () => (h.appendRun as Mock).mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('SDK pipeline: success paths', () => {
  it('quickfix success opens a draft PR and journals pr_open with all cost', async () => {
    expect(await deliver(issue)).toBe('pr_open');
    expect(h.openPrHandler).toHaveBeenCalledTimes(1);
    expect(journal()).toHaveLength(1);
    expect(journal()[0]).toMatchObject({ issue: 412, outcome: 'pr_open', rounds: 1, lesson: 'clean run' });
    // coder 0.5 + doc-writer 0.1 + review 0.3 + verify 0.2
    expect(journal()[0].costUsd as number).toBeCloseTo(1.1, 5);
  });

  it('full lead completion opens a draft PR after review and verify', async () => {
    (h.triage as Mock).mockResolvedValue(triageFor('full'));
    expect(await deliver(issue)).toBe('pr_open');
    expect(h.runLead).toHaveBeenCalledTimes(1);
    expect(h.reviewLoop).toHaveBeenCalledWith(412, 'Plan P', expect.objectContaining({ branch: 'squad/412-fix-typo' }));
    expect(journal()[0]).toMatchObject({ outcome: 'pr_open' });
    expect(journal()[0].costUsd as number).toBeCloseTo(1.5, 5);
  });

  it('plan await, revise and approve resume the same lead session', async () => {
    (h.triage as Mock).mockResolvedValue(triageFor('full'));
    (h.runLead as Mock)
      .mockResolvedValueOnce(lead({ status: 'awaiting_approval', sessionId: 's-plan', costUsd: 0.5 }))
      .mockResolvedValueOnce(lead({ status: 'awaiting_approval', sessionId: 's-plan', costUsd: 0.5 }))
      .mockResolvedValueOnce(lead({ sessionId: 's-plan', costUsd: 0.5 }));
    (h.awaitApproval as Mock)
      .mockResolvedValueOnce({ kind: 'revise', notes: 'split it' })
      .mockResolvedValueOnce({ kind: 'approved', notes: '' });
    expect(await deliver(issue)).toBe('pr_open');
    const calls = (h.runLead as Mock).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1][3]).toEqual({ sessionId: 's-plan', answer: 'Revise the plan: split it' });
    expect(calls[2][3]).toEqual({ sessionId: 's-plan', answer: 'The plan is approved. Continue from step 3.' });
    expect(h.awaitApproval).toHaveBeenCalledTimes(2);
  });
});

describe('SDK pipeline: plan gate stops', () => {
  it('a plan timeout is blocked, with no PR and no review', async () => {
    (h.triage as Mock).mockResolvedValue(triageFor('full'));
    (h.runLead as Mock).mockResolvedValue(lead({ status: 'awaiting_approval', sessionId: 's-plan' }));
    (h.awaitApproval as Mock).mockResolvedValue({ kind: 'timeout' });
    expect(await deliver(issue)).toBe('blocked');
    expect(h.reviewLoop).not.toHaveBeenCalled();
    expect(h.openPrHandler).not.toHaveBeenCalled();
    expect(journal()[0]).toMatchObject({ outcome: 'blocked', rounds: 0 });
  });

  it('revisions beyond the limit are blocked with no PR', async () => {
    (h.triage as Mock).mockResolvedValue(triageFor('full'));
    (h.runLead as Mock).mockResolvedValue(lead({ status: 'awaiting_approval', sessionId: 's-plan' }));
    (h.awaitApproval as Mock).mockResolvedValue({ kind: 'revise', notes: 'again' });
    expect(await deliver(issue)).toBe('blocked');
    // Maximum two revisions, so the lead is resumed twice after the first ask and the third ask stops.
    expect(h.runLead).toHaveBeenCalledTimes(3);
    expect(h.openPrHandler).not.toHaveBeenCalled();
    expect(journal()[0].lesson).toBe('plan still not approved after 2 revisions');
  });

  it('a lead that reports blocked stops before review', async () => {
    (h.triage as Mock).mockResolvedValue(triageFor('full'));
    (h.runLead as Mock).mockResolvedValue(lead({ status: 'blocked', notes: 'missing API' }));
    expect(await deliver(issue)).toBe('blocked');
    expect(h.reviewLoop).not.toHaveBeenCalled();
    expect(journal()[0]).toMatchObject({ outcome: 'blocked', lesson: 'missing API' });
  });
});

describe('SDK pipeline: failed quickfix steps stop before review', () => {
  it('a quickfix coder that does not finish fails, keeps its cost, and skips doc-writer and review', async () => {
    roles.coder = failRun(0.4, 'provider rejected: 401');
    expect(await deliver(issue)).toBe('failed');
    expect(h.runAgent).toHaveBeenCalledTimes(1);
    expect(h.reviewLoop).not.toHaveBeenCalled();
    expect(journal()[0]).toMatchObject({ outcome: 'failed', rounds: 0 });
    expect(journal()[0].costUsd as number).toBeCloseTo(0.4, 5);
    expect(journal()[0].lesson as string).toContain('provider rejected: 401');
  });

  it('a doc-writer that does not finish fails before review and keeps both costs', async () => {
    roles['doc-writer'] = failRun(0.2, 'tool loop exhausted');
    expect(await deliver(issue)).toBe('failed');
    expect(h.reviewLoop).not.toHaveBeenCalled();
    expect(h.openPrHandler).not.toHaveBeenCalled();
    expect(journal()[0].costUsd as number).toBeCloseTo(0.7, 5);
  });

  it('a thrown provider error is an explicit failed outcome, with no cost spent', async () => {
    roles.coder = new Error('network down');
    expect(await deliver(issue)).toBe('failed');
    expect(journal()[0]).toMatchObject({ outcome: 'failed', costUsd: 0 });
  });
});

describe('SDK pipeline: review and verifier gates', () => {
  it('review escalation opens no PR and journals escalated', async () => {
    (h.triage as Mock).mockResolvedValue(triageFor('full'));
    (h.reviewLoop as Mock).mockResolvedValue({ outcome: 'escalate', rounds: 3, costUsd: 0.9, followUps: [], open: [{ file: 'a.ts', line: 1, issue: 'bug', fix: 'x' }], seen: [{ file: 'a.ts', line: 1, issue: 'bug', fix: 'x' }] });
    expect(await deliver(issue)).toBe('escalated');
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.openPrHandler).not.toHaveBeenCalled();
    expect(journal()[0]).toMatchObject({ outcome: 'escalated', rounds: 3, lesson: 'bug' });
  });

  it('a verifier hold opens no PR and journals escalated', async () => {
    (h.verify as Mock).mockResolvedValue({ verdict: 'hold', criteria: [], suite: 'red', gaps: ['suite is red'], costUsd: 0.2 });
    expect(await deliver(issue)).toBe('escalated');
    expect(h.openPrHandler).not.toHaveBeenCalled();
    expect(journal()[0].lesson).toBe('verifier hold: suite is red');
  });

  it('an open_pr error is failed, not a silent success', async () => {
    h.openPrHandler.mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Refusing to open a PR from protected branch main.' }] });
    expect(await deliver(issue)).toBe('failed');
    expect(h.requestHandler).not.toHaveBeenCalled();
    expect(journal()[0].outcome).toBe('failed');
  });
});

describe('SDK pipeline: explicit non-success outcomes', () => {
  it('a budget breach is over_budget and keeps the spend', async () => {
    roles.coder = okRun(16);
    expect(await deliver(issue)).toBe('over_budget');
    expect(h.runAgent).toHaveBeenCalledTimes(1);
    expect(journal()[0]).toMatchObject({ outcome: 'over_budget' });
    expect(journal()[0].costUsd as number).toBeCloseTo(16, 5);
  });

  it('a triage rejection and a needs_info route are returned, not swallowed', async () => {
    (h.triage as Mock).mockResolvedValueOnce(triageFor('reject'));
    expect(await deliver(issue)).toBe('rejected');
    (h.triage as Mock).mockResolvedValueOnce(triageFor('needs_info'));
    expect(await deliver(issue)).toBe('needs_info');
    expect(h.execCalls.some((c) => c.startsWith('git worktree add'))).toBe(false);
  });
});

describe('SDK pipeline: side effects are recorded, never executed, and never merge', () => {
  it('records git and gh commands in order and issues no merge', async () => {
    expect(await deliver(issue)).toBe('pr_open');
    const cmds = h.execCalls;
    expect(cmds[0]).toBe('gh issue list -R acme/shop --json title -q .[].title');
    expect(cmds[1]).toBe('git fetch origin main');
    expect(cmds[2]).toMatch(/^git worktree add -B squad\/412-fix-typo /);
    expect(cmds.every((c) => /^(gh|git) /.test(c))).toBe(true);
    expect(cmds.some((c) => /merge/i.test(c))).toBe(false);
  });

  it('the only merge-related call is a human approval request, never a merge', async () => {
    await deliver(issue);
    expect(h.requestHandler).toHaveBeenCalledWith(expect.objectContaining({ kind: 'merge', pr: 77 }), undefined);
    expect((h.requestHandler as Mock).mock.calls.every(([arg]) => arg.kind === 'merge')).toBe(true);
    expect(h.execCalls.some((c) => c.includes('pr merge') || c.includes('--auto'))).toBe(false);
  });

  it('a failing run still posts exactly one comment and journals once', async () => {
    roles.coder = new Error('boom');
    await deliver(issue);
    expect(h.execCalls.filter((c) => c.startsWith('gh issue comment'))).toHaveLength(1);
    expect(journal()).toHaveLength(1);
  });
});
