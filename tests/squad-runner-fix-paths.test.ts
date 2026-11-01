import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without declarations
import { fixTask, isConcreteFile, numberFindings, parseJudgement } from '../tools/squad/runner-judge.mjs';
// @ts-expect-error plain .mjs without declarations
import { parseFiles } from '../tools/squad/files-check.mjs';
// @ts-expect-error plain .mjs without declarations
import { controlEntry } from '../tools/squad/runner-core.mjs';

const REVIEW = { findings: [{ file: 'src/index.html:3', what: 'bug', why: 'x', fix: 'y' }] };
const fence = (v: unknown) => '```json\n' + JSON.stringify(v) + '\n```';

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
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/index.html (optional), src/catalog.js (optional)');
    expect(parseFiles(task.text, { all: true })).toEqual(['src/index.html', 'src/catalog.js']);
  });

  it('keeps the legacy Files line when no supporting files are given', () => {
    const task = fixTask(kept, { issue: '320', round: 1 });
    expect(parseFiles(task.text, { all: true })).toEqual(['src/index.html']);
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
    expect(parseFiles(task.text, { all: true })).toEqual(['src/a.ts']);
  });

  it('keeps ordinary finding files with a line suffix or a range', () => {
    const task = fixTask([finding('src/index.html:12'), finding('src/a.ts:3-9')], { issue: '320', round: 1 });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/index.html (optional), src/a.ts (optional)');
  });

  it('keeps the plain html finding file line', () => {
    const task = fixTask([finding('src/index.html:12')], { issue: '320', round: 1 });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/index.html (optional)');
  });

  it('marks every fix entry optional and parseFiles with all keeps the paths', () => {
    const task = fixTask([finding('README.md'), finding('src/index.html:4')], { issue: '320', round: 1 });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: README.md (optional), src/index.html (optional)');
    expect(parseFiles(task.text, { all: true })).toEqual(['README.md', 'src/index.html']);
    expect(parseFiles(task.text)).toEqual([]);
  });

  it.each(['.GIT/config', '.ENV', 'app/.Env.local', '.git/hooks/pre-commit'])('isConcreteFile refuses %s', (p) => {
    expect(isConcreteFile(p)).toBe(false);
  });

  it.each(['.GIT/config', '.ENV'])('refuses %s as a supporting file', (p) => {
    expect(fixTask([finding('src/index.html')], { issue: '320', round: 1, supportingFiles: [p] })).toBeNull();
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

describe('controlEntry markers', () => {
  it.each(['package.json (optional)+', 'package.json++', 'package.json+ (optional)'])('controlEntry strips every marker in %s', (entry) => {
    expect(controlEntry(entry)).toBe(true);
  });

  it('controlEntry is false for a non-control file with stacked markers', () => {
    expect(controlEntry('src/app.js (optional)+')).toBe(false);
  });
});

describe('parseFiles optional entries', () => {
  it('with all keeps an optional entry as its bare path', () => {
    expect(parseFiles('Files: README.md (optional), src/a.ts+', { all: true })).toEqual(['README.md', 'src/a.ts']);
  });

  it('by default still drops an optional entry', () => {
    expect(parseFiles('Files: README.md (optional), src/a.ts+')).toEqual(['src/a.ts']);
  });
});
