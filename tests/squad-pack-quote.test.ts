import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
  it('names the commit the task was packed from', { timeout: 30_000 }, () => {
    // The merge gate compares this line with the pull request head, so it must be the exact HEAD sha.
    const out = pack('reviewer');
    const m = /^Reviewed commit: ([0-9a-f]{40})$/m.exec(out);
    expect(m).not.toBeNull();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    expect(m?.[1]).toBe(head);
  });
});
