import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The module has no declaration file (the task names only the .mjs), so it is loaded through a computed specifier:
// TypeScript does not resolve that, and the types it needs are declared here.
const SCRIPT = fileURLToPath(new URL('../tools/squad/step-scope.mjs', import.meta.url));
interface StepScope {
  stepDone(subjects: string[], step: number | string, issue: number | string): boolean;
  toStage(changed: string[], foreign: string[], writeDirs: string[], files: string[]): string[];
  touchedForeign(before: Record<string, string>, after: Record<string, string>): string[];
  writeDirsFor(write: string[], files: string[]): string[];
  badEntries(files: string[]): string[];
}
const { badEntries, stepDone, toStage, touchedForeign, writeDirsFor } = (await import(/* @vite-ignore */ SCRIPT)) as StepScope;

function cli(...args: string[]): string {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

describe('writeDirsFor', () => {
  it('adds the directory of each Files entry to the write list', () => {
    expect(writeDirsFor(['src'], ['examples/dev-squad/src/a.ts', 'tests/x.test.ts', 'CHANGELOG.md', 'docs/**/*.md']))
      .toEqual(['src', 'examples/dev-squad/src', 'tests', 'CHANGELOG.md', 'docs']);
  });

  it('strips a trailing slash so src/ and src are one write dir', () => {
    expect(writeDirsFor(['src/'], ['tests/a.ts'])).toEqual(['src', 'tests']);
  });
});

describe('badEntries', () => {
  it('flags an absolute entry and a ".." segment', () => {
    expect(badEntries(['/etc/passwd', '../x', 'a/../b'])).toEqual(['/etc/passwd', '../x', 'a/../b']);
  });

  it('flags a drive-letter or backslash entry, which is absolute or a separator on Windows', () => {
    expect(badEntries(['C:/x', 'C:\\x', 'a\\b'])).toEqual(['C:/x', 'C:\\x', 'a\\b']);
  });

  it('accepts entries inside the repo, globs and root files', () => {
    expect(badEntries(['src/a.ts', 'docs/**/*.md', 'CHANGELOG.md'])).toEqual([]);
  });
});

describe('stepDone', () => {
  const subjects = ['fix the parser, step 1 (#353)', 'other work'];

  it('matches the step and issue of a subject', () => {
    expect(stepDone(subjects, 1, 353)).toBe(true);
  });

  it('is false for a different issue number', () => {
    expect(stepDone(subjects, 1, 35)).toBe(false);
    expect(stepDone(subjects, 1, 3)).toBe(false);
  });

  it('is false for a different step', () => {
    expect(stepDone(subjects, 12, 353)).toBe(false);
  });
});

describe('toStage', () => {
  const files = ['src/a.ts', 'CHANGELOG.md'];
  const writeDirs = writeDirsFor(['src'], files);

  it('drops foreign, drops paths outside write dirs and Files, keeps Files roots and nested write paths', () => {
    const changed = ['src/a.ts', 'src/notes/b.ts', 'CHANGELOG.md', 'docs/x.md', 'src/foreign.ts'];
    expect(toStage(changed, ['src/foreign.ts'], writeDirs, files))
      .toEqual(['src/a.ts', 'src/notes/b.ts', 'CHANGELOG.md']);
  });
});

describe('touchedForeign', () => {
  it('reports a changed hash and a removed path, not an unchanged one', () => {
    const before = { 'a.md': 'h1', 'b.md': 'h2', 'c.md': 'h3' };
    const after = { 'a.md': 'h1', 'b.md': 'h9', 'c.md': '-' };
    expect(touchedForeign(before, after)).toEqual(['b.md', 'c.md']);
  });
});

describe('step-scope CLI in a temp repo', () => {
  it('snapshots the foreign edit, stages only the step file, and flags the foreign file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'step-scope-'));
    try {
      const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
      git('init', '-q');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 't');
      mkdirSync(join(dir, 'src'));
      mkdirSync(join(dir, 'tools', 'squad'), { recursive: true });
      writeFileSync(join(dir, 'src', 'a.ts'), 'a\n');
      writeFileSync(join(dir, 'NOTES.md'), 'notes\n');
      writeFileSync(join(dir, 'tools', 'squad', 'squad.json'), JSON.stringify({ project: 't', base: 'HEAD', write: ['src'] }));
      git('add', '-A');
      git('commit', '-q', '-m', 'init');

      // The maintainer's uncommitted edit is in the snapshot before the step runs.
      writeFileSync(join(dir, 'NOTES.md'), 'maintainer edit\n');
      const snapFile = join(dir, 'snapshot.txt');
      const snapOut = cli('snapshot', dir);
      writeFileSync(snapFile, `${snapOut}\n`);
      expect(snapOut).toMatch(/\tNOTES\.md$/m);

      // The step edits its own file and the foreign file again.
      writeFileSync(join(dir, 'src', 'a.ts'), 'changed\n');
      writeFileSync(join(dir, 'NOTES.md'), 'maintainer edit 2\n');
      const task = join(dir, 'task.md');
      writeFileSync(task, 'Files: src/a.ts\n');

      expect(cli('stage', task, 'HEAD', dir, snapFile, '')).toBe('src/a.ts');
      expect(cli('foreign-touched', snapFile, dir)).toBe('NOTES.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it('keeps a pre-staged foreign file out, stages a non-ASCII name, and reports out-of-scope root changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'step-scope-'));
    try {
      const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
      git('init', '-q');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 't');
      mkdirSync(join(dir, 'src'));
      mkdirSync(join(dir, 'tools', 'squad'), { recursive: true });
      writeFileSync(join(dir, 'src', 'a.ts'), 'a\n');
      writeFileSync(join(dir, 'NOTES.md'), 'notes\n');
      writeFileSync(join(dir, 'README.md'), 'readme\n');
      writeFileSync(join(dir, 'tools', 'squad', 'squad.json'), JSON.stringify({ project: 't', base: 'HEAD', write: ['src'] }));
      git('add', '-A');
      git('commit', '-q', '-m', 'init');

      // The maintainer edits and stages a file before the run: the snapshot sees it, and the step must not commit it.
      writeFileSync(join(dir, 'NOTES.md'), 'maintainer edit\n');
      git('add', 'NOTES.md');
      // The snapshot and task files live beside the repo, not in it, so git does not report them as changes.
      const aux = mkdtempSync(join(tmpdir(), 'step-scope-aux-'));
      try {
        const snapFile = join(aux, 'snapshot.txt');
        writeFileSync(snapFile, `${cli('snapshot', dir)}\n`);

        // The step adds a non-ASCII file under src; the coder also edits README.md, which is not in Files.
        writeFileSync(join(dir, 'src', 'café.ts'), 'x\n');
        writeFileSync(join(dir, 'README.md'), 'changed readme\n');
        const task = join(aux, 'task.md');
        writeFileSync(task, 'Files: src/a.ts\n');

        const staged = cli('stage', task, 'HEAD', dir, snapFile, '').split('\n');
        expect(staged).toContain('src/café.ts');
        expect(staged).not.toContain('NOTES.md');
        expect(cli('outside', task, 'HEAD', dir, snapFile, '')).toBe('README.md');

        // A Files entry that leaves the repo is refused by write.
        writeFileSync(task, 'Files: ../x\n');
        expect(() => cli('write', task, dir)).toThrow(/exit 2/);
      } finally {
        rmSync(aux, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports a step done when the config base is HEAD, since HEAD is then the base itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'step-scope-done-'));
    try {
      const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
      git('init', '-q');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 't');
      mkdirSync(join(dir, 'tools', 'squad'), { recursive: true });
      writeFileSync(join(dir, 'tools', 'squad', 'squad.json'), JSON.stringify({ project: 't', base: 'HEAD', write: ['src'] }));
      git('add', '-A');
      git('commit', '-q', '-m', 'init');
      writeFileSync(join(dir, 'a.txt'), 'a\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'x, step 01 (#7)');

      expect(cli('done', '7', '01', dir)).toBe('yes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
