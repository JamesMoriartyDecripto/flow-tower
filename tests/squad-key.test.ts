import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanEnv } from './fixtures/clean-env';

const CLI = resolve('bin/flow-tower.js');
const FAKE_KEY = 'sk-or-test-0123456789abcdef';
const DOT = '.' + 'env';

/**
 * Runs `squad key` with a temp user folder as FLOW_TOWER_HOME and no key in the environment, so the
 * developer's real key file and variable never leak into the test. `input` goes to stdin (a pipe here).
 */
function runKey(home: string, args: string[], input = '', extraEnv: Record<string, string> = {}) {
  const env = cleanEnv({ FLOW_TOWER_HOME: home, ...extraEnv });
  // Removed first, then set back only when the test asks for it: the parent's key must not reach the child.
  delete env.OPENROUTER_API_KEY;
  if (extraEnv.OPENROUTER_API_KEY !== undefined) env.OPENROUTER_API_KEY = extraEnv.OPENROUTER_API_KEY;
  return spawnSync(process.execPath, [CLI, 'squad', 'key', ...args], { encoding: 'utf8', input, timeout: 20_000, env });
}

const newHome = () => mkdtempSync(join(tmpdir(), 'squad-key-'));

describe('squad key (#265)', () => {
  it('saves a piped key into the user folder file, mode 600, without echoing it', { timeout: 30_000 }, () => {
    const home = newHome();
    const r = runKey(home, [], `${FAKE_KEY}\n`);
    expect(r.status, r.stderr).toBe(0);
    const file = join(home, DOT);
    expect(readFileSync(file, 'utf8')).toBe(`OPENROUTER_API_KEY=${FAKE_KEY}\n`);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(r.stdout + r.stderr).not.toContain(FAKE_KEY);
    expect(r.stdout).toContain('only you can read it');
  });

  it('keeps other lines and replaces the old key line', { timeout: 30_000 }, () => {
    const home = newHome();
    const file = join(home, DOT);
    writeFileSync(file, 'OTHER=1\nOPENROUTER_API_KEY=sk-or-old\n');
    const r = runKey(home, [], `${FAKE_KEY}\n`);
    expect(r.status, r.stderr).toBe(0);
    const lines = readFileSync(file, 'utf8').split('\n');
    expect(lines).toContain('OTHER=1');
    expect(lines.filter((l) => l.startsWith('OPENROUTER_API_KEY='))).toEqual([`OPENROUTER_API_KEY=${FAKE_KEY}`]);
    expect(readFileSync(file, 'utf8')).not.toContain('sk-or-old');
  });

  it('refuses a value that is not an OpenRouter key and writes nothing', { timeout: 30_000 }, () => {
    const home = newHome();
    const r = runKey(home, [], 'not-a-key\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sk-or-');
    expect(existsSync(join(home, DOT))).toBe(false);
  });

  it('status says whether a key is set, and where it comes from, without printing it', { timeout: 30_000 }, () => {
    const home = newHome();
    const before = runKey(home, ['status']);
    expect(before.status).toBe(1);
    expect(before.stdout).toContain('https://openrouter.ai/keys');

    expect(runKey(home, [], `${FAKE_KEY}\n`).status).toBe(0);
    const after = runKey(home, ['status']);
    expect(after.status).toBe(0);
    expect(after.stdout).toContain(join(home, DOT));
    expect(after.stdout + after.stderr).not.toContain(FAKE_KEY);

    const fromEnv = runKey(home, ['status'], '', { OPENROUTER_API_KEY: FAKE_KEY });
    expect(fromEnv.status).toBe(0);
    expect(fromEnv.stdout).toContain('from the environment');
    expect(fromEnv.stdout).not.toContain(FAKE_KEY);
  });
});
