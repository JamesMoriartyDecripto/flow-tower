import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plistText, type RunResult, runService, type ServiceContext, systemdWord, unitText, xml } from '../src/cli/service.ts';

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// A fake secret: the tests check it reaches the hub header, never that it is printed.
const TOKEN = 'ft_satellite_fake-test-secret';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'ft-service-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

/** A fake command runner: records every call and answers from a script keyed by the start of "cmd args". */
function fakeRun(answers: Record<string, Partial<RunResult>> = {}) {
  const calls: string[] = [];
  const run = (cmd: string, args: string[]): RunResult => {
    const key = [cmd, ...args].join(' ');
    calls.push(key);
    const hit = Object.entries(answers).find(([k]) => key.startsWith(k));
    return { status: 0, stdout: '', stderr: '', missing: false, ...(hit?.[1] ?? {}) };
  };
  return { calls, run };
}

function ctx(platform: NodeJS.Platform, run: ServiceContext['run'], logs: string[]): ServiceContext {
  return { home, env: {}, checkout: CHECKOUT, node: '/opt/node 22/bin/node', platform, uid: 501, user: 'mimir', run, log: (l) => logs.push(l) };
}

describe('service file text', () => {
  it('quotes a path with a space in the systemd unit and keeps the ampersand literal', () => {
    const text = unitText({ node: '/opt/node 22/bin/node', cli: '/home/me/R&D flow/bin/flow-tower.js', port: 5317, home: '/home/me/ft home' });
    expect(text).toContain('ExecStart="/opt/node 22/bin/node" "/home/me/R&D flow/bin/flow-tower.js" library --no-open --port 5317');
    expect(text).toContain('Environment="FLOW_TOWER_HOME=/home/me/ft home"');
    expect(text).toContain('Restart=on-failure');
  });

  it('escapes systemd specifiers and quotes', () => {
    expect(systemdWord('a$b%c"d\\e')).toBe('"a$$b%%c\\"d\\\\e"');
    expect(systemdWord('plain')).toBe('plain');
  });

  it('XML-escapes the ampersand and other markup in the plist', () => {
    expect(xml('R&D <a> "q"')).toBe('R&amp;D &lt;a&gt; &quot;q&quot;');
    const text = plistText({ node: '/opt/node', cli: '/x/R&D flow/bin/flow-tower.js', port: 5317, logFile: '/Users/me/Library/Logs/flow-tower.log', home: '/h&h' });
    expect(text).toContain('<string>/x/R&amp;D flow/bin/flow-tower.js</string>');
    expect(text).toContain('<string>/h&amp;h</string>');
    expect(text).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    expect(text).toContain('<key>RunAtLoad</key>');
    expect(text).toContain('<key>KeepAlive</key>');
    expect(text).toContain('<string>/Users/me/Library/Logs/flow-tower.log</string>');
  });
});

describe('service install and status', () => {
  it('on Linux writes the unit, reloads, then enables it now, in that order', () => {
    const logs: string[] = [];
    const { calls, run } = fakeRun();
    expect(runService(['install', '--port', '6000'], ctx('linux', run, logs))).toBe(0);
    expect(calls).toEqual([
      'systemctl --version',
      'systemctl --user daemon-reload',
      'systemctl --user enable --now flow-tower',
    ]);
    expect(existsSync(join(home, '.config', 'systemd', 'user', 'flow-tower.service'))).toBe(true);
    expect(logs.join('\n')).toContain('loginctl enable-linger mimir');
  });

  it('on Linux without systemctl writes nothing and prints the nohup line', () => {
    const logs: string[] = [];
    const { calls, run } = fakeRun({ 'systemctl --version': { missing: true, status: null } });
    expect(runService(['install'], ctx('linux', run, logs))).toBe(1);
    expect(calls).toEqual(['systemctl --version']);
    expect(existsSync(join(home, '.config', 'systemd'))).toBe(false);
    expect(logs.join('\n')).toMatch(/nohup .* library --no-open --port 5317/);
  });

  it('on macOS boots out a previous agent, then bootstraps the plist', () => {
    const logs: string[] = [];
    const { calls, run } = fakeRun();
    expect(runService(['install', '--port', '6000'], ctx('darwin', run, logs))).toBe(0);
    expect(calls).toEqual([
      'launchctl bootout gui/501/dev.flowtower.library',
      `launchctl bootstrap gui/501 ${join(home, 'Library', 'LaunchAgents', 'dev.flowtower.library.plist')}`,
    ]);
  });

  it('maps systemctl is-active output to status', () => {
    const logs: string[] = [];
    const active = fakeRun({ 'systemctl --user is-active': { stdout: 'active\n' } });
    expect(runService(['status'], ctx('linux', active.run, logs))).toBe(0);
    expect(logs.at(-1)).toContain('running');
    const down = fakeRun({ 'systemctl --user is-active': { stdout: 'inactive\n', status: 3 } });
    expect(runService(['status'], ctx('linux', down.run, logs))).toBe(1);
    expect(logs.at(-1)).toContain('not running (inactive)');
  });

  it('maps launchctl print output to status', () => {
    const logs: string[] = [];
    const running = fakeRun({ 'launchctl print': { stdout: '\tstate = running\n' } });
    expect(runService(['status'], ctx('darwin', running.run, logs))).toBe(0);
    const missing = fakeRun({ 'launchctl print': { status: 113 } });
    expect(runService(['status'], ctx('darwin', missing.run, logs))).toBe(1);
    expect(logs.at(-1)).toContain('not installed');
  });

  it('rejects a bad port before running anything', () => {
    const logs: string[] = [];
    const { calls, run } = fakeRun();
    expect(runService(['install', '--port', '99999'], ctx('linux', run, logs))).toBe(2);
    expect(calls).toEqual([]);
  });
});

describe('service uninstall', () => {
  it('removes only the flow-tower unit and leaves a neighbouring file alone', () => {
    const dir = join(home, '.config', 'systemd', 'user');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'flow-tower.service'), 'ours');
    writeFileSync(join(dir, 'other.service'), 'theirs');
    const logs: string[] = [];
    const { run } = fakeRun();
    expect(runService(['uninstall'], ctx('linux', run, logs))).toBe(0);
    expect(existsSync(join(dir, 'flow-tower.service'))).toBe(false);
    expect(readFileSync(join(dir, 'other.service'), 'utf8')).toBe('theirs');
  });
});

describe('emit hub fallback', () => {
  let hub: Server;
  let hubUrl: string;
  const hits: { token?: string; path?: string }[] = [];

  beforeEach(async () => {
    hits.length = 0;
    // The fake hub on port 0: it records each POST and answers 204, like a hub that accepts the event.
    hub = createServer((req: IncomingMessage, res) => {
      hits.push({ token: req.headers['x-flow-tower-token'] as string | undefined, path: req.url });
      req.resume();
      req.on('end', () => res.writeHead(204).end());
    });
    await new Promise<void>((r) => hub.listen(0, '127.0.0.1', r));
    hubUrl = `http://127.0.0.1:${(hub.address() as { port: number }).port}`;
  });
  afterEach(async () => { await new Promise((r) => hub.close(r)); });

  it('posts once to the config hub with the config token when the local server refuses', async () => {
    // A port that was free a moment ago: nothing listens there, so the local POST is refused.
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const deadUrl = `http://127.0.0.1:${(closed.address() as { port: number }).port}`;
    await new Promise((r) => closed.close(r));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ role: 'satellite', url: hubUrl, token: TOKEN, machine: 'laptop' }));
    // The local record names the dead port; this test process is alive, so the record is read as live.
    writeFileSync(join(home, 'local-server.json'), JSON.stringify({ url: deadUrl, pid: process.pid }));

    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, FLOW_TOWER_HOME: home };
    const child = spawn(process.execPath, [join(CHECKOUT, 'bin', 'flow-tower.js'), 'emit', '--kind', 'turn'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    const exit = await new Promise<number | null>((r) => child.on('close', r));

    expect(exit).toBe(0);
    expect(out).toBe('');
    expect(hits).toEqual([{ token: TOKEN, path: '/api/events' }]);
  });
});
