import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The packer prints the answer format; these cases pin the quote field the merge gate checks findings against.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function pack(role: 'reviewer' | 'security'): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-quote-'));
  const brief = join(dir, 'brief.md');
  writeFileSync(brief, 'Check the quote field.\n');
  return execFileSync(
    'node',
    ['tools/squad/pack.mjs', '--role', role, '--issue', '1', '--brief', brief, '--base', 'HEAD', '--paths', 'tools'],
    { cwd: REPO, encoding: 'utf8', timeout: 30_000 },
  );
}

describe('squad pack answer format', () => {
  it('asks reviewers for a quote of the cited line', { timeout: 30_000 }, () => {
    const out = pack('reviewer');
    expect(out).toContain('"file":"path:line","quote":"..."');
    expect(out).toContain('copied character by character');
  });

  it('asks security reviewers for a quote after the severity', { timeout: 30_000 }, () => {
    const out = pack('security');
    expect(out).toContain('"severity":"critical|high|medium|low", "file":"path:line","quote":"..."');
  });

  it('points the quote at the diff or the files below, not above the answer format', { timeout: 30_000 }, () => {
    // Only the answer-format section is checked: the diff below may quote the old wording of this very rule.
    const out = pack('reviewer');
    const format = out.slice(out.indexOf('## Answer format'), out.indexOf('## Diff'));
    expect(format).toContain('as shown in the diff or the files below');
    expect(format).toContain('without the leading + or - of a diff line');
    expect(format).not.toContain('as shown above');
  });
});

describe('squad pack reviewed commit', () => {
  it('omits the commit line when the tree has uncommitted changes', { timeout: 60_000 }, () => {
    // Runs on a temp repo: the repo this suite runs in may be dirty while tests run.
    const repo = mkdtempSync(join(tmpdir(), 'pack-reviewed-'));
    const git = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=squad-test', '-c', 'user.email=squad-test@example.invalid', ...a], { encoding: 'utf8' });
    git('init', '-q');
    mkdirSync(join(repo, 'tools'));
    writeFileSync(join(repo, 'tools', 'a.txt'), 'one\n');
    git('add', 'tools/a.txt');
    git('commit', '-q', '-m', 'init');
    const head = git('rev-parse', 'HEAD').trim();
    const brief = join(repo, 'brief.md');
    writeFileSync(brief, 'Check the reviewed commit.\n');
    const run = () => spawnSync(
      'node',
      [join(REPO, 'tools/squad/pack.mjs'), '--role', 'reviewer', '--issue', '1', '--repo', repo, '--base', 'HEAD', '--paths', 'tools', '--brief', brief],
      { cwd: REPO, encoding: 'utf8', timeout: 30_000 },
    );

    const clean = run();
    expect(clean.status).toBe(0);
    expect(clean.stdout.split('\n')[2]).toBe(`Reviewed commit: ${head}`);

    writeFileSync(join(repo, 'tools', 'a.txt'), 'two\n');
    const dirty = run();
    expect(dirty.status).toBe(0);
    expect(dirty.stdout).not.toMatch(/^Reviewed commit:/m);
    expect(dirty.stderr).toContain('uncommitted changes');
  });
});
