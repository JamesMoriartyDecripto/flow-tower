import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node ESM helper, no type declarations
import { parseFiles, missingFiles, knownGaps } from '../tools/squad/files-check.mjs';
// @ts-expect-error plain Node ESM helper, no type declarations
import { writeDirs } from '../tools/squad/args.mjs';

const cli = fileURLToPath(new URL('../tools/squad/files-check.mjs', import.meta.url));

describe('squad files check (#176)', () => {
  it('parses the Files line: strips +, drops (optional) and empty entries', () => {
    const task = 'Do it.\nFiles: a/x.ts+, b/y.ts (optional), , c/z.ts\n';
    expect(parseFiles(task)).toEqual(['a/x.ts', 'c/z.ts']);
  });

  it('returns [] without a Files line and lets the last Files line win', () => {
    expect(parseFiles('no list here')).toEqual([]);
    expect(parseFiles('Files: old.ts\nprose\nFiles: new.ts+')).toEqual(['new.ts']);
  });

  it('matches exact paths, directory prefixes and globs', () => {
    const changed = ['src/app/doc/a.ts', 'tools/squad/run.mjs', 'tests/x/deep/y.test.ts'];
    expect(missingFiles(['tools/squad/run.mjs'], changed)).toEqual([]);
    expect(missingFiles(['src/app/doc/', 'src/app/doc'], changed)).toEqual([]);
    expect(missingFiles(['tools/*/run.mjs'], changed)).toEqual([]);
    expect(missingFiles(['tools/*.mjs'], changed)).toEqual(['tools/*.mjs']);
    expect(missingFiles(['tests/**/*.test.ts'], changed)).toEqual([]);
    expect(missingFiles(['**/y.test.ts'], changed)).toEqual([]);
  });

  it('returns the unsatisfied entries in input order', () => {
    const changed = ['src/a.ts'];
    expect(missingFiles(['src/a.ts', 'tests/b.ts', 'docs/c.md'], changed)).toEqual(['tests/b.ts', 'docs/c.md']);
    expect(missingFiles(['src/a', 'src/ab.ts'], changed)).toEqual(['src/a', 'src/ab.ts']);
  });

  it('reads the Known gaps section from a heading or a label line', () => {
    const heading = 'Done.\n\n## Known gaps\n- no retry on 429\n- cache not warmed\n\n## Files\nfoo';
    expect(knownGaps(heading)).toBe('- no retry on 429\n- cache not warmed');
    expect(knownGaps('Done.\nKnown gaps: the batch path is untested')).toBe('the batch path is untested');
  });

  it('treats none or n/a as no known gap', () => {
    expect(knownGaps('## Known gaps\nnone')).toBe('');
    expect(knownGaps('Known gaps: N/A.\n')).toBe('');
    expect(knownGaps('no section at all')).toBe('');
  });

  it('CLI: ok when all listed paths changed, missing otherwise, 2 on bad usage', () => {
    const repo = mkdtempSync(join(tmpdir(), 'files-check-'));
    try {
      const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' });
      git('init', '-q', '-b', 'main');
      writeFileSync(join(repo, 'a.ts'), 'a\n');
      git('add', '.');
      git('commit', '-q', '-m', 'base');
      writeFileSync(join(repo, 'a.ts'), 'a2\n');
      writeFileSync(join(repo, 'new.ts'), 'n\n');
      const task = join(repo, 'task.md');
      writeFileSync(task, 'Files: a.ts, new.ts+\n');
      const ok = spawnSync(process.execPath, [cli, task, 'main', repo], { encoding: 'utf8' });
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain('files check: ok (2 listed)');
      writeFileSync(task, 'Files: a.ts, missing.ts\n');
      const bad = spawnSync(process.execPath, [cli, task, 'main', repo], { encoding: 'utf8' });
      expect(bad.status).toBe(1);
      expect(bad.stdout).toContain('files check: missing missing.ts');
      const usage = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
      expect(usage.status).toBe(2);
      expect(usage.stderr).toContain('usage:');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('squad --write dirs (#176)', () => {
  it('keeps the slash inside a dir and drops leading and trailing slashes', () => {
    expect(writeDirs('tools/squad,tests')).toEqual(['tools/squad', 'tests']);
    expect(writeDirs('tools/squad/')).toEqual(['tools/squad']);
  });

  it('refuses empty, absolute and ".." dirs', () => {
    expect(writeDirs('')).toBeNull();
    expect(writeDirs('src,,tests')).toBeNull();
    expect(writeDirs('/etc')).toBeNull();
    expect(writeDirs('../outside')).toBeNull();
    expect(writeDirs('src/../../x')).toBeNull();
  });
});
