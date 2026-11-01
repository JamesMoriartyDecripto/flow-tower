import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without declarations
import { STYLE_RULES } from '../tools/squad/config.mjs';

// The reviewer and security prompts must ask for the simplest change that meets the task (#367).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function pack(role: 'reviewer' | 'security'): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-simplest-'));
  const brief = join(dir, 'brief.md');
  writeFileSync(brief, 'Check the simplest change.\n');
  return execFileSync(
    'node',
    ['tools/squad/pack.mjs', '--role', role, '--issue', '367', '--brief', brief, '--base', 'HEAD', '--paths', 'tools'],
    { cwd: REPO, encoding: 'utf8', timeout: 30_000 },
  );
}

describe('simplest change rule (#367)', () => {
  it('tells every role to write the minimum', () => {
    expect(STYLE_RULES).toContain('Write the minimum that meets the task: no abstraction, option or check it does not ask for.');
  });

  it('makes the reviewer flag unneeded complexity', { timeout: 30_000 }, () => {
    const out = pack('reviewer');
    expect(out).toContain('unneeded complexity: code or checks the brief does not ask for,');
    expect(out).toContain('a second copy of an existing mechanism, a solution bigger than the task.');
  });

  it('makes the security reviewer name the existing guard before proposing a check', { timeout: 30_000 }, () => {
    const out = pack('security');
    expect(out).toContain('Before proposing a new check, name the existing guard that could cover the case;');
  });
});
