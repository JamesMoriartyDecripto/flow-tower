import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The procedure and its helpers are plain JavaScript; the fakes below record every call so the scope is checked in order.
// @ts-expect-error plain .mjs without declarations
import { fixTask, isConcreteFile, judgePrompt, numberFindings, parseJudgement } from '../tools/squad/runner-judge.mjs';
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

describe('parseJudgement supportingFiles', () => {
  const ids = ['R1', 'R2'];

  it('keeps the legacy return shape when no supportingFiles field is present', () => {
    const text = fence({ R1: { decision: 'keep', reason: 'r' }, R2: { decision: 'drop', reason: 'h' } });
    expect(parseJudgement(text, ids)).toEqual({ ok: true, keep: ['R1'], drop: [{ id: 'R2', reason: 'h' }] });
  });

  it('maps a kept id to its validated, deduplicated supporting files', () => {
    const text = fence({
      R1: { decision: 'keep', reason: 'r', supportingFiles: ['src/catalog.js', 'src/catalog.js', 'src/style.css'] },
      R2: { decision: 'drop', reason: 'h' },
    });
    const r = parseJudgement(text, ids);
    expect(r.ok).toBe(true);
    expect(r.supporting).toEqual({ R1: ['src/catalog.js', 'src/style.css'] });
  });

  it('does not grant scope to a dropped id, but still validates its supportingFiles', () => {
    const grant = fence({
      R1: { decision: 'keep', reason: 'r' },
      R2: { decision: 'drop', reason: 'h', supportingFiles: ['src/catalog.js'] },
    });
    const r = parseJudgement(grant, ids);
    expect(r.ok).toBe(true);
    expect(r.supporting).toBeUndefined();
    const bad = fence({
      R1: { decision: 'keep', reason: 'r' },
      R2: { decision: 'drop', reason: 'h', supportingFiles: ['../x'] },
    });
    expect(parseJudgement(bad, ids).ok).toBe(false);
  });

  it('ignores supportingFiles on an unknown id, which grants nothing', () => {
    const text = fence({
      R1: { decision: 'keep', reason: 'r' },
      R2: { decision: 'drop', reason: 'h' },
      X9: { decision: 'keep', reason: 'extra', supportingFiles: ['src/auth/session.ts'] },
    });
    expect(parseJudgement(text, ids)).toEqual({ ok: true, keep: ['R1'], drop: [{ id: 'R2', reason: 'h' }] });
  });

  it.each([
    ['a string instead of an array', 'src/a.js'],
    ['a non-string element', [42]],
    ['an absolute path', ['/etc/passwd']],
    ['a home path', ['~/.ssh/config']],
    ['a drive letter', ['C:/x.js']],
    ['a backslash path', ['src\\a.js']],
    ['a traversal segment', ['src/../../x.js']],
    ['an empty segment', ['src//a.js']],
    ['a dot segment', ['./src/a.js']],
    ['a trailing slash', ['src/']],
    ['whitespace', ['src/my file.js']],
    ['a control character', ['src/a\u0007.js']],
    ['a comma', ['src/a,b.js']],
    ['a wildcard', ['src/*.js']],
    ['a line suffix', ['src/a.js:4']],
    ['a Files modifier', ['src/new.js+']],
    ['a (optional) marker', ['src/a.js (optional)']],
    ['a git path', ['.git/config']],
    ['an env path', ['.env']],
    ['a nested env path', ['app/.env.local']],
    ['an empty string', ['']],
  ])('refuses %s', (_name, files) => {
    const text = fence({ R1: { decision: 'keep', reason: 'r', supportingFiles: files }, R2: { decision: 'drop', reason: 'h' } });
    expect(parseJudgement(text, ids).ok).toBe(false);
  });
});

describe('fixTask supportingFiles', () => {
  const kept = numberFindings(REVIEW, null).map((f: any) => ({ ...f }));

  it('lists the finding file and the supporting file in Files, each once, and parseFiles reads them back', () => {
    const task = fixTask([...kept, { id: 'R9', file: 'src/catalog.js:5', what: 'c', fix: 'd' }], {
      issue: '320', round: 1, supportingFiles: ['src/index.html', 'src/catalog.js'],
    });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/index.html, src/catalog.js');
    expect(parseFiles(task.text)).toEqual(['src/index.html', 'src/catalog.js']);
  });

  it('keeps the legacy Files line when no supporting files are given', () => {
    const task = fixTask(kept, { issue: '320', round: 1 });
    expect(parseFiles(task.text)).toEqual(['src/index.html']);
  });

  it.each([
    ['an absolute path', ['/etc/passwd']],
    ['a traversal path', ['../x']],
    ['a comma', ['src/a,b.js']],
    ['a wildcard', ['src/*.js']],
    ['a .git path', ['.git/hooks/pre-commit']],
    ['a non-array', 'src/a.js'],
  ])('fails closed on %s even for a direct caller', (_name, extra) => {
    expect(fixTask(kept, { issue: '320', round: 1, supportingFiles: extra as any })).toBeNull();
  });
});

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
    expect(parseFiles(fixText)).toEqual(['src/index.html', 'src/catalog.js']);
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
    expect(parseFiles(written.find((t) => t.includes('fix the kept review findings'))))
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

describe('fixTask finding file safety', () => {
  const finding = (file: string) => ({ id: 'R1', file, what: 'bug', why: 'x', fix: 'y' });

  it('fails closed when a finding file smuggles a second path with a comma', () => {
    expect(fixTask([finding('src/a.ts, .git/config')], { issue: '320', round: 1 })).toBeNull();
  });

  it('fails closed when one kept finding is unsafe, even next to a safe one', () => {
    const task = fixTask([finding('src/a.ts'), finding('src/b.ts, .env')], { issue: '320', round: 1 });
    expect(task).toBeNull();
  });

  it('still leaves out a finding outside the repository and keeps the rest', () => {
    const task = fixTask([finding('../outside.ts'), finding('src/a.ts')], { issue: '320', round: 1 });
    expect(parseFiles(task.text)).toEqual(['src/a.ts']);
  });

  it('keeps ordinary finding files with a line suffix or a range', () => {
    const task = fixTask([finding('src/index.html:12'), finding('src/a.ts:3-9')], { issue: '320', round: 1 });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/index.html, src/a.ts');
  });

  it('keeps the plain html finding file line', () => {
    const task = fixTask([finding('src/index.html:12')], { issue: '320', round: 1 });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/index.html');
  });

  it.each(['.GIT/config', '.ENV', 'app/.Env.local', '.git/hooks/pre-commit'])('isConcreteFile refuses %s', (p) => {
    expect(isConcreteFile(p)).toBe(false);
  });

  it.each(['.GIT/config', '.ENV'])('refuses %s as a supporting file', (p) => {
    expect(fixTask([finding('src/index.html')], { issue: '320', round: 1, supportingFiles: [p] })).toBeNull();
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

describe('isConcreteFile allowlist', () => {
  it.each(['src/a;id', 'src/$(id)', '-rf', 'src/a b'])('refuses %s', (p) => {
    expect(isConcreteFile(p)).toBe(false);
  });

  it.each(['.ssh/config', 'keys/x.pem', 'id_rsa', '.npmrc'])('refuses the secret path %s', (p) => {
    expect(isConcreteFile(p)).toBe(false);
  });

  it.each(['src/index.html', 'src/@types/x.d.ts', '.gitignore', 'docs/a-b_c.md'])('accepts %s', (p) => {
    expect(isConcreteFile(p)).toBe(true);
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
