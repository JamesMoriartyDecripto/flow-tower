import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RunResult, runService, type ServiceContext } from '../src/cli/service.ts';

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'ft-service-status-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

/** A runner where `systemctl` is not installed: every call comes back as missing. */
function noSystemctl(): ServiceContext['run'] {
  return (): RunResult => ({ status: null, stdout: '', stderr: '', missing: true });
}

describe('service status without systemd', () => {
  it('says the library is not managed as a service and never suggests install', () => {
    const logs: string[] = [];
    const ctx: ServiceContext = {
      home, env: {}, checkout: CHECKOUT, node: '/usr/bin/node', platform: 'linux', uid: 1000, user: 'mimir',
      run: noSystemctl(), log: (l) => logs.push(l),
    };
    expect(runService(['status'], ctx)).toBe(1);
    expect(logs).toEqual(['systemd is not available here: the library is not managed as a service']);
  });
});
