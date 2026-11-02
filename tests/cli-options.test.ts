import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanEnv } from './fixtures/clean-env';

/** Option parsing is shared by every command: a mistyped option must print one line, not a stack trace. */
const CLI = join(import.meta.dirname, '..', 'bin', 'flow-tower.js');

describe('flow-tower option errors', () => {
  it('an unknown option prints one line and exits 1', () => {
    const r = spawnSync(process.execPath, [CLI, 'emit', '--bogus', 'x'], { encoding: 'utf8', env: cleanEnv(), timeout: 20000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('flow-tower:');
    expect(r.stderr).toContain('--bogus');
    expect(r.stderr.split('\n').some((line) => line.startsWith('    at '))).toBe(false);
  }, 20000);

  it('emit accepts --call', () => {
    // Nothing listens on port 9: the send fails, but the option must parse.
    const r = spawnSync(process.execPath, [CLI, 'emit', '--kind', 'log', '--call', 'c1', '--url', 'http://127.0.0.1:9', '-m', 't'], { encoding: 'utf8', env: cleanEnv(), timeout: 20000 });
    expect(`${r.stdout}${r.stderr}`).not.toContain('Unknown option');
  }, 20000);
});
