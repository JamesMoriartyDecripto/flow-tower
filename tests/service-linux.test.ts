import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RunResult, runService, type ServiceContext, stableNode, unitText } from '../src/cli/service.ts';

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

/** A fake runner that answers `systemctl --user is-active` with `state` and everything else with success. */
function activeRun(state: string): ServiceContext['run'] {
  return (cmd, args) => {
    const isActive = cmd === 'systemctl' && args.includes('is-active');
    return { status: isActive && state !== 'active' ? 3 : 0, stdout: isActive ? `${state}\n` : '', stderr: '', missing: false };
  };
}

function writeUnit() {
  const dir = join(home, '.config', 'systemd', 'user');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'flow-tower.service'), 'ours');
}

describe('service status on Linux with an installed unit', () => {
  it('says the journal is the place to look when the unit is failed', () => {
    writeUnit();
    const logs: string[] = [];
    expect(runService(['status'], ctx(activeRun('failed'), logs))).toBe(1);
    expect(logs).toEqual(['installed but not running (failed): journalctl --user -u flow-tower']);
  });

  it('keeps the start hint for an inactive unit', () => {
    writeUnit();
    const logs: string[] = [];
    expect(runService(['status'], ctx(activeRun('inactive'), logs))).toBe(1);
    expect(logs).toEqual(['installed but not running: systemctl --user start flow-tower']);
  });
});

describe('service install on Linux with the library', () => {
  it('warns when the user folder library is empty', () => {
    const logs: string[] = [];
    const { run } = fakeRun();
    expect(runService(['install', '--port', '5399'], ctx(run, logs))).toBe(0);
    expect(logs.some((l) => l.startsWith('your library is empty, so the service cannot start yet: '))).toBe(true);
    expect(logs.join('\n')).toContain('systemctl --user restart flow-tower');
  });

  it('does not warn when the user folder has a library entry', () => {
    const entry = mkdtempSync(join(tmpdir(), 'ft-service-entry-'));
    try {
      mkdirSync(join(home, '.config', 'flow-tower'), { recursive: true });
      writeFileSync(join(home, '.config', 'flow-tower', 'config.json'), JSON.stringify({ library: [entry] }));
      const logs: string[] = [];
      const { run } = fakeRun();
      expect(runService(['install', '--port', '5399'], ctx(run, logs))).toBe(0);
      expect(logs.join('\n')).not.toContain('your library is empty');
    } finally {
      rmSync(entry, { recursive: true, force: true });
    }
  });

  it('omits the linger hint in a wayland session', () => {
    const logs: string[] = [];
    const { run } = fakeRun();
    expect(runService(['install', '--port', '5399'], { ...ctx(run, logs), env: { XDG_SESSION_TYPE: 'wayland' } })).toBe(0);
    expect(logs.join('\n')).not.toContain('enable-linger');
  });

  it('keeps the linger hint in a tty session', () => {
    const logs: string[] = [];
    const { run } = fakeRun();
    expect(runService(['install', '--port', '5399'], { ...ctx(run, logs), env: { XDG_SESSION_TYPE: 'tty' } })).toBe(0);
    expect(logs.join('\n')).toContain('loginctl enable-linger mimir');
  });
});

/** A fake realpath: maps known links to their targets and throws for anything unknown, as realpathSync does. */
function fakeReal(links: Record<string, string>) {
  return (path: string): string => {
    if (path in links) return links[path];
    if (Object.values(links).includes(path)) return path;
    throw new Error(`ENOENT: ${path}`);
  };
}

/** A fake stat: every directory is a root-owned 0o755 directory, so only the injected `real` decides. */
const trustedStat = (): { mode: number } => ({ mode: 0o40755 });

describe('stableNode', () => {
  const real = fakeReal({ '/usr/bin/node': '/usr/bin/node-24', '/usr/bin/node-24': '/usr/bin/node-24' });

  it('names the PATH link that resolves to the same binary as execPath', () => {
    expect(stableNode('/usr/bin/node-24', '/usr/local/bin:/usr/bin', real, trustedStat)).toBe('/usr/bin/node');
  });

  it('keeps execPath when no PATH directory links to it', () => {
    expect(stableNode('/usr/bin/node-24', '/opt/bin:/usr/local/bin', real, trustedStat)).toBe('/usr/bin/node-24');
  });

  it('keeps execPath when PATH is undefined', () => {
    expect(stableNode('/usr/bin/node-24', undefined, real, trustedStat)).toBe('/usr/bin/node-24');
  });

  it('keeps execPath when it cannot be resolved', () => {
    expect(stableNode('/gone/node', '/usr/bin', real, trustedStat)).toBe('/gone/node');
  });
});

describe('stableNode trust checks', () => {
  // Both the versioned binary and a link to it sit under the PATH directories the tests vary.
  const real = fakeReal({ '/usr/bin/node': '/usr/bin/node-24', '/usr/bin/node-24': '/usr/bin/node-24', 'node_modules/.bin/node': '/usr/bin/node-24', './node': '/usr/bin/node-24' });

  it('skips a relative PATH entry, so ExecStart never becomes relative', () => {
    expect(stableNode('/usr/bin/node-24', '.:node_modules/.bin:/usr/bin', real, trustedStat)).toBe('/usr/bin/node');
    expect(stableNode('/usr/bin/node-24', '.:node_modules/.bin', real, trustedStat)).toBe('/usr/bin/node-24');
  });

  it('skips a directory writable by group', () => {
    const stat = (dir: string) => ({ mode: dir === '/opt/bin' ? 0o40775 : 0o40755 });
    const linked = fakeReal({ '/usr/bin/node-24': '/usr/bin/node-24', '/opt/bin/node': '/usr/bin/node-24', '/usr/bin/node': '/usr/bin/node-24' });
    expect(stableNode('/usr/bin/node-24', '/opt/bin:/usr/bin', linked, stat)).toBe('/usr/bin/node');
  });

  it('skips a directory writable by others, even when it is the only match', () => {
    const stat = () => ({ mode: 0o40777 });
    expect(stableNode('/usr/bin/node-24', '/usr/bin', real, stat)).toBe('/usr/bin/node-24');
  });

  it('skips a directory that cannot be stat-ed', () => {
    const stat = (dir: string) => {
      if (dir === '/usr/bin') throw new Error(`ENOENT: ${dir}`);
      return { mode: 0o40755 };
    };
    const linked = fakeReal({ '/usr/bin/node-24': '/usr/bin/node-24', '/usr/local/bin/node': '/usr/bin/node-24', '/usr/bin/node': '/usr/bin/node-24' });
    expect(stableNode('/usr/bin/node-24', '/usr/bin:/usr/local/bin', linked, stat)).toBe('/usr/local/bin/node');
  });

  it('accepts a root-owned 0o40755 directory', () => {
    expect(stableNode('/usr/bin/node-24', '/usr/bin', real, () => ({ mode: 0o40755 }))).toBe('/usr/bin/node');
  });
});
