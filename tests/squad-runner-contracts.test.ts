import { describe, expect, it } from 'vitest';
// The fakes record each role prompt and return the finish report the way a real run does: fenced JSON, then Known gaps.
// @ts-expect-error plain .mjs without declarations
import { workIssue } from '../tools/squad/runner-core.mjs';

const ISSUE = { number: 320, title: 'Explicit finish reports', body: 'Report the actual result.' };
const LIMITS = { usdPerIssue: 5, minutes: 30, fixRounds: 1 };
const PLAN = { criteria: ['reports are explicit'], steps: [{ title: 'Edit prompts', items: ['add the rule'], files: ['tools/squad/runner-core.mjs'] }] };
const fence = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const report = (json: string) => `${json}\nKnown gaps: none`;

// Fake deps: `answer` gives each role its finish report, `review` the quality result of the first round. Every prompt is
// kept by role name, so a test can check what each stage was asked to do.
function fakeDeps(answer: (name: string) => { ok: boolean; text: string }, review?: any) {
  const prompts: Record<string, string> = {};
  const calls: string[] = [];
  const deps = {
    gh: {
      claim: async () => true,
      comment: async (_n: number, body: string) => { calls.push(`comment:${body.split('\n')[0]}`); },
      fail: async (_n: number, reason: string) => { calls.push(`fail:${reason}`); },
      done: async () => { calls.push('done'); },
      release: async () => { calls.push('release'); },
      draftPr: async () => { calls.push('draftPr'); return 'https://pr/320'; },
    },
    role: async (name: string, prompt: string) => {
      prompts[name] = prompt;
      calls.push(`role:${name}`);
      return answer(name);
    },
    worktree: async () => ({ path: '/wt', branch: 'squad/320' }),
    writeTasks: async () => '/wt/tasks',
    steps: async () => ({ ok: true, tail: '' }),
    quality: async () => ({ ok: true, review: review ?? { findings: [] }, security: { findings: [] } }),
    push: async () => {},
    gate: async () => ({ ready: true, text: 'READY: #320' }),
    spent: async () => 0,
    now: () => 0,
  };
  return { deps, prompts, calls };
}

const TRIAGE = report(fence({ route: 'full', areas: ['tools'], questions: [], rationale: 'ok' }));
const PLAN_REPORT = report(fence(PLAN));
const PASS = 'PASS\nAll criteria met.\nKnown gaps: none';

describe('finish report contracts', () => {
  it('asks the triage, architect, lead-judge and verifier prompts for the actual result in the finish report', async () => {
    const review = { findings: [{ file: 'src/a.ts:3', what: 'bug', why: 'x', fix: 'y' }] };
    const { deps, prompts } = fakeDeps((name) => {
      if (name === 'triage') return { ok: true, text: TRIAGE };
      if (name === 'architect') return { ok: true, text: PLAN_REPORT };
      if (name === 'lead-judge') return { ok: true, text: report(fence({ R1: { decision: 'drop', reason: 'noise' } })) };
      return { ok: true, text: PASS };
    }, review);
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    for (const role of ['triage', 'architect', 'lead-judge', 'verifier']) {
      expect(prompts[role], role).toContain('finish');
      expect(prompts[role], role).toContain('Known gaps:');
    }
    expect(prompts.triage).toContain('actual ```json block as the report');
    expect(prompts.architect).toContain('actual ```json block as the report');
    expect(prompts['lead-judge']).toContain('actual ```json block as the report');
    expect(prompts.verifier).toContain('same text as the report');
  });

  it('parses a fenced finish report followed by Known gaps and reaches a draft PR', async () => {
    const { deps, calls } = fakeDeps((name) => {
      if (name === 'triage') return { ok: true, text: TRIAGE };
      if (name === 'architect') return { ok: true, text: PLAN_REPORT };
      return { ok: true, text: PASS };
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    expect(calls).toContain('draftPr');
    expect(calls).toContain('done');
    expect(calls.some((c) => c.startsWith('fail:'))).toBe(false);
  });

  it('does not pass a verifier run that failed, even when its report starts with PASS', async () => {
    const { deps, calls } = fakeDeps((name) => {
      if (name === 'triage') return { ok: true, text: TRIAGE };
      if (name === 'architect') return { ok: true, text: PLAN_REPORT };
      return { ok: false, text: PASS };
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls.some((c) => c.startsWith('fail:verifier held the change'))).toBe(true);
    expect(calls).not.toContain('draftPr');
  });

  it('does not accept a failed triage run whose report is valid-looking JSON', async () => {
    const { deps, calls } = fakeDeps((name) => ({ ok: name !== 'triage', text: TRIAGE }));
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:triage gave no usable answer');
    expect(calls).not.toContain('draftPr');
  });
});
