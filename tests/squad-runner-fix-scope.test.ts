import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The procedure and its helpers are plain JavaScript; the fakes below record every call so the scope is checked in order.
// @ts-expect-error plain .mjs without declarations
import { judgePrompt, numberFindings, parseJudgement } from '../tools/squad/runner-judge.mjs';
// @ts-expect-error plain .mjs without declarations
import { parseFiles } from '../tools/squad/files-check.mjs';
// @ts-expect-error plain .mjs without declarations
import { workIssue } from '../tools/squad/runner-core.mjs';

const ISSUE = { number: 91, title: 'Add a badge', body: 'Show a badge on the card.' };
const LIMITS = { usdPerIssue: 5, minutes: 30, fixRounds: 1 };
const PLAN = { criteria: ['badge shows'], steps: [{ title: 'Add badge', items: ['render it'], files: ['src/badge.ts'] }] };
const fence = (v: unknown) => '```json\n' + JSON.stringify(v) + '\n```';
const triageFull = fence({ route: 'full', areas: ['ui'], questions: [], rationale: 'ok' });
const REVIEW = { findings: [{ file: 'src/index.html:3', what: 'bug', why: 'x', fix: 'y' }] };
const KEEP = (extra: Record<string, unknown> = {}) => fence({ R1: { decision: 'keep', reason: 'real', ...extra } });

// A minimal fake of the deps workIssue needs: role answers come from `answers` in order, and the first quality
// result is the review. Every call is recorded, and writeTasks keeps the file names it was given.
function fakeDeps(answers: Record<string, string[]>, review: any = REVIEW) {
  const calls: string[] = [];
  const written: string[] = [];
  const queue: Record<string, string[]> = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  let quality = 0;
  const deps = {
    gh: {
      claim: async () => true,
      comment: async (_n: number, body: string) => { calls.push(`comment:${body.split('\n')[0]}`); },
      fail: async (_n: number, reason: string) => { calls.push(`fail:${reason}`); },
      done: async () => { calls.push('done'); },
      release: async () => { calls.push('release'); },
      draftPr: async () => { calls.push('draftPr'); return 'https://pr/1'; },
    },
    role: async (name: string) => {
      calls.push(`role:${name}`);
      const next = queue[name]?.shift();
      return { ok: true, text: next ?? 'PASS' };
    },
    worktree: async () => ({ path: '/wt', branch: 'squad/91' }),
    writeTasks: async (_p: string, _n: number, files: { name: string; text: string }[]) => {
      for (const f of files) { written.push(f.text); calls.push(`writeTasks:${f.name}`); }
      return '/wt/tasks';
    },
    steps: async () => { calls.push('steps'); return { ok: true, tail: '' }; },
    quality: async () => {
      calls.push('quality');
      quality++;
      return quality === 1 ? { ok: true, review, security: { findings: [] } } : { ok: true, review: { findings: [] }, security: { findings: [] } };
    },
    push: async () => { calls.push('push'); },
    gate: async () => ({ ready: true, text: 'READY: #91' }),
    spent: async () => 0,
    now: () => 0,
  };
  return { deps, calls, written };
}

describe('workIssue fix scope', () => {
  it('writes a fix task whose Files line carries a kept finding supporting file', async () => {
    const { deps, calls, written } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['src/catalog.js'] })],
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    expect(calls).toContain('writeTasks:91-review-fixes.md');
    const fixText = written.find((t) => t.includes('fix the kept review findings'));
    expect(parseFiles(fixText, { all: true })).toEqual(['src/index.html', 'src/catalog.js']);
  });

  it('stops before any fix write when a kept supporting file is sensitive', async () => {
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['src/auth/session.ts'] })],
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:sensitive area in a fix round: a person must lead this issue');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });

  it('asks the judge again once on an invalid scope, and uses the valid answer', async () => {
    const { deps, calls, written } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['../escape.js'] }), KEEP({ supportingFiles: ['src/catalog.js'] })],
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    expect(calls.filter((c) => c === 'role:lead-judge')).toHaveLength(2);
    expect(parseFiles(written.find((t) => t.includes('fix the kept review findings')), { all: true }))
      .toEqual(['src/index.html', 'src/catalog.js']);
  });

  it('stops after a second invalid scope, with no fix task written', async () => {
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['../escape.js'] }), KEEP({ supportingFiles: ['.env'] })],
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:lead-judge gave no usable answer');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });

  it('tells the judge why its answer was refused on the retry', async () => {
    const six = ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 'src/e.js', 'src/f.js'];
    const prompts: string[] = [];
    const { deps } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: six }), KEEP({ supportingFiles: ['src/catalog.js'] })],
    });
    const role = deps.role as (...args: any[]) => Promise<{ ok: boolean; text: string }>;
    (deps as any).role = async (name: string, prompt: string, ...rest: any[]) => {
      if (name === 'lead-judge') prompts.push(prompt);
      return role(name, prompt, ...rest);
    };
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('supportingFiles allows at most 5 files');
  });
});

describe('supporting file limits and prompt', () => {
  const five = ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 'src/e.js'];

  it('accepts exactly 5 supporting files for one kept id', () => {
    const text = fence({ R1: { decision: 'keep', reason: 'r', supportingFiles: five }, R2: { decision: 'drop', reason: 'h' } });
    const r = parseJudgement(text, ['R1', 'R2']);
    expect(r.ok).toBe(true);
    expect(r.supporting).toEqual({ R1: five });
  });

  it('rejects 6 supporting files for one id, kept or dropped', () => {
    const six = [...five, 'src/f.js'];
    const kept = fence({ R1: { decision: 'keep', reason: 'r', supportingFiles: six }, R2: { decision: 'drop', reason: 'h' } });
    expect(parseJudgement(kept, ['R1', 'R2'])).toEqual({ ok: false, error: 'R1: supportingFiles allows at most 5 files' });
    const dropped = fence({ R1: { decision: 'keep', reason: 'r' }, R2: { decision: 'drop', reason: 'h', supportingFiles: six } });
    expect(parseJudgement(dropped, ['R1', 'R2']).ok).toBe(false);
  });

  it('shows the concrete example in the judge template, never the bare [optional] placeholder', () => {
    const prompt = judgePrompt(numberFindings(REVIEW, null), 'brief');
    expect(prompt).toContain('"supportingFiles": ["relative/file.ext"]');
    expect(prompt).not.toContain('[optional]');
    expect(prompt).toContain('supportingFiles is optional and only for a keep');
  });

  it('stops before the fix task is written when a supporting src is an existing directory', async () => {
    const wtPath = mkdtempSync(join(tmpdir(), 'squad-wt-'));
    mkdirSync(join(wtPath, 'src'));
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['src'] })],
    });
    deps.worktree = async () => ({ path: wtPath, branch: 'squad/91' });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:fix files must name regular files, not directories or links');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });
});

describe('workIssue Files path on disk', () => {
  it.each(['.github/workflows/ci.yml', 'tools/squad/squad.json'])('stops when a kept supporting file is %s, before writeTasks', async (p) => {
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: [p] })],
    });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:sensitive area in a fix round: a person must lead this issue');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('stops when a supporting file is a FIFO, before writeTasks', async () => {
    const wtPath = mkdtempSync(join(tmpdir(), 'squad-wt-'));
    execFileSync('mkfifo', [join(wtPath, 'pipe')]);
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['pipe'] })],
    });
    deps.worktree = async () => ({ path: wtPath, branch: 'squad/91' });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:fix files must name regular files, not directories or links');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });

  it('stops when a kept finding file is an existing directory, before writeTasks', async () => {
    const wtPath = mkdtempSync(join(tmpdir(), 'squad-wt-'));
    mkdirSync(join(wtPath, 'src'));
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP()],
    }, { findings: [{ file: 'src', what: 'bug', why: 'x', fix: 'y' }] });
    deps.worktree = async () => ({ path: wtPath, branch: 'squad/91' });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:fix files must name regular files, not directories or links');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });

  it('stops when a supporting file is a symbolic link, before writeTasks', async () => {
    const wtPath = mkdtempSync(join(tmpdir(), 'squad-wt-'));
    const outside = mkdtempSync(join(tmpdir(), 'squad-out-'));
    symlinkSync(outside, join(wtPath, 'linked'));
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP({ supportingFiles: ['linked'] })],
    });
    deps.worktree = async () => ({ path: wtPath, branch: 'squad/91' });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:fix files must name regular files, not directories or links');
    expect(calls.some((c) => c.startsWith('writeTasks:91-review-fixes'))).toBe(false);
  });
});

describe('control files are checked on paths, not prose', () => {
  it('reaches pr when the issue body only names package.json and tools/squad/squad.json in prose', async () => {
    const issue = { ...ISSUE, body: 'The repo already has package.json and project rules in tools/squad/squad.json.' };
    const { deps, calls } = fakeDeps({ triage: [triageFull], architect: [fence(PLAN)], 'lead-judge': [KEEP()] });
    expect(await workIssue(issue, deps, LIMITS)).toBe('pr');
    expect(calls).toContain('draftPr');
  });

  it('stops with the plan sign-off message when a plan step file is package.json', async () => {
    const plan = { ...PLAN, steps: [{ title: 'Bump dep', items: ['edit manifest'], files: ['package.json'] }] };
    const { deps, calls } = fakeDeps({ triage: [triageFull], architect: [fence(plan)] });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:sensitive area in the plan: a person must lead this issue (plan sign-off)');
    expect(calls.some((c) => c.startsWith('writeTasks:'))).toBe(false);
  });

  it('still stops a fix round that names .github/workflows/ci.yml or tools/squad/squad.json as a path', async () => {
    for (const p of ['.github/workflows/ci.yml', 'tools/squad/squad.json']) {
      const { deps, calls } = fakeDeps({ triage: [triageFull], architect: [fence(PLAN)], 'lead-judge': [KEEP({ supportingFiles: [p] })] });
      expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
      expect(calls).toContain('fail:sensitive area in a fix round: a person must lead this issue');
    }
  });
});

describe('findings still open after the last fix round', () => {
  it('reaches pr and lists the kept reviewer finding under Open findings', async () => {
    const { deps, calls, written } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [KEEP(), KEEP()],
    });
    (deps as any).quality = async () => { calls.push('quality'); return { ok: true, review: REVIEW, security: { findings: [] } }; };
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    const body = written.find((t) => t.includes('Open findings'));
    expect(body).toContain('Open findings (after the last fix round):\n- R1 (`src/index.html:3`): bug');
    expect(calls).toContain('draftPr');
  });

  it('stops with the still-open message when a kept security finding is high every round', async () => {
    const security = { findings: [{ file: 'src/cache.js:1', what: 'leak', why: 'x', fix: 'y', severity: 'High' }] };
    const keepS = fence({ S1: { decision: 'keep', reason: 'real' } });
    const { deps, calls } = fakeDeps({
      triage: [triageFull],
      architect: [fence(PLAN)],
      'lead-judge': [keepS, keepS],
    });
    (deps as any).quality = async () => { calls.push('quality'); return { ok: true, review: { findings: [] }, security }; };
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:findings still open after 1 fix rounds');
    expect(calls).not.toContain('draftPr');
  });

  it.each([['High.'], [undefined], ['critical (CVSS 9)']])('fails closed when a kept security finding has severity %s', async (severity) => {
    const security = { findings: [{ file: 'src/cache.js:1', what: 'leak', why: 'x', fix: 'y', severity }] };
    const keepS = fence({ S1: { decision: 'keep', reason: 'real' } });
    const { deps, calls } = fakeDeps({ triage: [triageFull], architect: [fence(PLAN)], 'lead-judge': [keepS, keepS] });
    (deps as any).quality = async () => { calls.push('quality'); return { ok: true, review: { findings: [] }, security }; };
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:findings still open after 1 fix rounds');
    expect(calls).not.toContain('draftPr');
  });

  it('reaches pr and lists a kept low security finding under Open findings', async () => {
    const security = { findings: [{ file: 'src/cache.js:1', what: 'leak', why: 'x', fix: 'y', severity: 'low' }] };
    const keepS = fence({ S1: { decision: 'keep', reason: 'real' } });
    const { deps, calls, written } = fakeDeps({ triage: [triageFull], architect: [fence(PLAN)], 'lead-judge': [keepS, keepS] });
    (deps as any).quality = async () => { calls.push('quality'); return { ok: true, review: { findings: [] }, security }; };
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    expect(written.find((t) => t.includes('Open findings'))).toContain('Open findings (after the last fix round):\n- S1');
    expect(calls).toContain('draftPr');
  });
});

describe('control files named through Files entry markers and directories', () => {
  it.each([
    ['package.json+'],
    ['package.json (optional)'],
    ['tools/squad'],
    ['.github'],
    ['tools/**'],
  ])('stops the plan when a step file is %s', async (entry) => {
    const plan = { ...PLAN, steps: [{ title: 'Edit', items: ['change it'], files: [entry] }] };
    const { deps, calls } = fakeDeps({ triage: [triageFull], architect: [fence(plan)] });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('failed');
    expect(calls).toContain('fail:sensitive area in the plan: a person must lead this issue (plan sign-off)');
    expect(calls.some((c) => c.startsWith('writeTasks:'))).toBe(false);
  });

  it('reaches pr when the plan names a glob and a new file that are not control files', async () => {
    const plan = { ...PLAN, steps: [{ title: 'Add app', items: ['write it'], files: ['src/**', 'src/app.js+'] }] };
    const { deps, calls } = fakeDeps({ triage: [triageFull], architect: [fence(plan)], 'lead-judge': [KEEP()] });
    expect(await workIssue(ISSUE, deps, LIMITS)).toBe('pr');
    expect(calls).toContain('draftPr');
  });
});
