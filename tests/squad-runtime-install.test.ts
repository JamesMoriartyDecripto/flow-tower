import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RUNTIME_IGNORE_LINE, installRuntime, type Runner } from '../src/cli/squad-runtime-install';

// Every temp folder is removed after the suite. The fake runner below never starts npm, so no network or paid call.
const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A squad folder with the bundle's lockfile in place, as init leaves it. */
function squadWithLock(withLock = true): string {
  const squad = mkdtempSync(join(tmpdir(), 'squad-runtime-'));
  made.push(squad);
  mkdirSync(join(squad, 'dev-squad'), { recursive: true });
  if (withLock) writeFileSync(join(squad, 'dev-squad', 'package-lock.json'), '{}\n');
  return squad;
}

/** A fake runner that records its calls and returns the given result. */
function fakeRunner(result: ReturnType<Runner>) {
  const calls: { cmd: string; args: string[]; opts: unknown }[] = [];
  const run: Runner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return result;
  };
  return { run, calls };
}

describe('squad runtime install (#332)', () => {
  it('runs npm ci in the bundle folder with install scripts off and inherited stdio', () => {
    const squad = squadWithLock();
    const fake = fakeRunner({ status: 0 });
    expect(installRuntime(squad, fake.run)).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.cmd).toBe('npm');
    expect(call.args).toEqual(['ci', '--prefix', join(squad, 'dev-squad'), '--ignore-scripts']);
    expect(call.opts).toMatchObject({ stdio: 'inherit' });
  });

  it('returns an error with the exit code when npm ci fails, without throwing', () => {
    const squad = squadWithLock();
    const fake = fakeRunner({ status: 1 });
    const res = installRuntime(squad, fake.run);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('npm ci failed');
    expect(res.error).toContain('exit 1');
  });

  it('returns an error when npm cannot be started', () => {
    const squad = squadWithLock();
    const fake = fakeRunner({ status: null, error: new Error('ENOENT') });
    const res = installRuntime(squad, fake.run);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('could not start npm: ENOENT');
  });

  it('refuses before running npm when the lockfile is missing', () => {
    const squad = squadWithLock(false);
    const fake = fakeRunner({ status: 0 });
    const res = installRuntime(squad, fake.run);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no package-lock.json');
    expect(fake.calls).toHaveLength(0);
  });

  it('generates the ignore line for the runtime node_modules, under the bundle folder', () => {
    expect(RUNTIME_IGNORE_LINE).toBe('tools/squad/dev-squad/node_modules/');
  });
});
