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
});
