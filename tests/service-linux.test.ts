import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RunResult, runService, type ServiceContext, unitText } from '../src/cli/service.ts';

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'ft-service-linux-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

/** A fake command runner: records every call as "cmd args" and answers every call with success. */
function fakeRun() {
  const calls: string[] = [];
  const run = (cmd: string, args: string[]): RunResult => {
    calls.push([cmd, ...args].join(' '));
    return { status: 0, stdout: '', stderr: '', missing: false };
  };
  return { calls, run };
}

function ctx(run: ServiceContext['run'], logs: string[]): ServiceContext {
  return { home, env: {}, checkout: CHECKOUT, node: '/usr/bin/node', platform: 'linux', uid: 1000, user: 'mimir', run, log: (l) => logs.push(l) };
}

describe('systemd unit exit codes', () => {
  it('declares 130 and 143 as success so a stop does not leave the unit failed', () => {
    const text = unitText({ node: '/usr/bin/node', cli: '/x/bin/flow-tower.js', port: 5317 });
    expect(text).toContain('SuccessExitStatus=130 143');
    expect(text).toContain('Restart=on-failure');
    // A systemd comment line starts with '#'; the explanation sits right above the directive.
    expect(text).toMatch(/# .*\nSuccessExitStatus=130 143\n/);
  });
});

describe('service uninstall on Linux', () => {
  it('disables, reloads, resets the failed state in that order, and removes the unit file', () => {
    const dir = join(home, '.config', 'systemd', 'user');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'flow-tower.service'), 'ours');
    const logs: string[] = [];
    const { calls, run } = fakeRun();
    expect(runService(['uninstall'], ctx(run, logs))).toBe(0);
    expect(calls).toEqual([
      'systemctl --user disable --now flow-tower',
      'systemctl --user daemon-reload',
      'systemctl --user reset-failed flow-tower',
    ]);
    expect(existsSync(join(dir, 'flow-tower.service'))).toBe(false);
  });
});
