/**
 * `flow-tower service install|status|uninstall [--port N]` (#194): runs the local library as a user service,
 * so the hooks always reach a running server and no event is lost to a refused connection. Linux gets a
 * systemd user unit, macOS a launchd agent. Every command goes through `run`, so tests fake it and never
 * touch the real home, systemd or launchd. Everything that touches the home folder takes a context.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readObject } from '../../bin/config-file.js';
import { localServerFile, localServerUrl } from '../../bin/local-server.js';
import { cliName, shellQuote } from '../../bin/cli-name.js';
import { libraryEntries } from '../../bin/library.js';
import { AGENT_LABEL, plistText, unitText } from './service-files.ts';

// The text builders live in service-files.ts; they are re-exported here so callers keep one import path.
export { systemdWord, xml, unitText, plistText } from './service-files.ts';

const DEFAULT_PORT = 5317;
const UNIT_NAME = 'flow-tower';
const UNIT_FILE = `${UNIT_NAME}.service`;
const USAGE = 'usage: flow-tower service install|status|uninstall [--port N]';

export interface RunResult { status: number | null; stdout: string; stderr: string; missing: boolean }
/** Runs one command; `missing` is true when the program itself is not installed (no systemctl, no launchctl). */
export type Run = (cmd: string, args: string[]) => RunResult;

export interface ServiceContext {
  /** The user's home: where the unit and the plist go. Tests pass a temp dir. */
  home: string;
  env: NodeJS.ProcessEnv;
  /** The flow-tower checkout: bin/flow-tower.js lives under it. */
  checkout: string;
  /** The Node that runs the library: process.execPath in real use. */
  node: string;
  platform: NodeJS.Platform;
  uid: number;
  user: string;
  run: Run;
  /**
   * Whether something accepts a TCP connection on 127.0.0.1:port. Synchronous, because runService is. Absent in
   * tests, so they never touch a real port; the real context probes in a short child process.
   */
  listening?: (port: number) => boolean;
  log: (line: string) => void;
}

/** A child Node that connects to 127.0.0.1:<port> and exits 0 on success, 1 on refusal or after one second. */
const PROBE_SCRIPT = `const s = require('node:net').connect(Number(process.argv[1]), '127.0.0.1');
s.on('connect', () => { s.destroy(); process.exit(0); });
s.on('error', () => process.exit(1));
setTimeout(() => process.exit(1), 1000).unref();`;

/**
 * The node command to write into a unit: a PATH name for execPath when one points at the same file (Fedora's
 * /usr/bin/node links to the versioned binary), else execPath itself. The versioned name (node-24) goes away on
 * the next major upgrade; the plain name follows the upgrade. `real` resolves links and is injected for tests.
 *
 * The name is written verbatim into ExecStart and systemd resolves it again at every start, so only trusted
 * directories count: a relative PATH entry would make ExecStart relative, and a directory that group or others
 * can write to would let someone swap its `node` after install. `stat` is injected for tests too.
 */
export function stableNode(
  execPath: string,
  pathVar: string | undefined,
  real: (path: string) => string = realpathSync,
  stat: (path: string) => { mode: number } = statSync,
): string {
  let target: string;
  try {
    target = real(execPath);
  } catch {
    return execPath;
  }
  for (const dir of (pathVar ?? '').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    try {
      // 0o022 is the group- and other-write bit: a directory open to other users is not a place to pin a node.
      if (stat(dir).mode & 0o022) continue;
    } catch {
      continue;
    }
    const candidate = join(dir, 'node');
    try {
      if (real(candidate) === target) return candidate;
    } catch { /* no node in this directory: keep looking */ }
  }
  return execPath;
}

export function defaultServiceContext(): ServiceContext {
  return {
    home: homedir(),
    env: process.env,
    checkout: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
    node: stableNode(process.execPath, process.env.PATH),
    platform: process.platform,
    uid: process.getuid?.() ?? 0,
    user: userInfo().username,
    run: (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', missing: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' };
    },
    listening: (port) => spawnSync(process.execPath, ['-e', PROBE_SCRIPT, String(port)], { timeout: 3000 }).status === 0,
    log: (line) => console.log(line),
  };
}

/** The user folder: the same place emit and the library record use (FLOW_TOWER_HOME, else ~/.config/flow-tower). */
function userFolder(ctx: ServiceContext): string {
  return ctx.env.FLOW_TOWER_HOME || join(ctx.home, '.config', 'flow-tower');
}

function parsePort(text: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid --port "${text}": use 1-65535`);
  return n;
}

/** --port, else the port of the library this user folder recorded, else the default. */
export function choosePort(typed: string | undefined, ctx: ServiceContext): number {
  if (typed !== undefined) return parsePort(typed);
  const recorded = localServerUrl({ env: ctx.env, home: userFolder(ctx) });
  if (recorded) {
    try {
      const port = Number(new URL(recorded).port);
      if (port) return port;
    } catch { /* a broken record: fall through to the default */ }
  }
  return DEFAULT_PORT;
}

function unitPath(ctx: ServiceContext): string {
  return join(ctx.home, '.config', 'systemd', 'user', UNIT_FILE);
}

function plistPath(ctx: ServiceContext): string {
  return join(ctx.home, 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);
}

function logPath(ctx: ServiceContext): string {
  return join(ctx.home, 'Library', 'Logs', 'flow-tower.log');
}

/** The file inputs every unit needs: the node binary, the checkout's CLI, the port and the user folder if set. */
function serviceInputs(ctx: ServiceContext, port: number) {
  const cli = join(ctx.checkout, 'bin', 'flow-tower.js');
  const home = ctx.env.FLOW_TOWER_HOME || undefined;
  return { node: ctx.node, cli, port, home };
}

/** The line to print when no service manager runs: a plain background process the user starts by hand. */
function nohupLine(ctx: ServiceContext, port: number): string {
  const { node, cli, home } = serviceInputs(ctx, port);
  const prefix = home ? `FLOW_TOWER_HOME=${shellQuote(home)} ` : '';
  return `${prefix}nohup ${shellQuote(node)} ${shellQuote(cli)} library --no-open --port ${port} >> ${shellQuote(join(userFolder(ctx), 'library.log'))} 2>&1 &`;
}

function noSystemd(ctx: ServiceContext, port: number): number {
  ctx.log('systemctl not found: no systemd user service here.');
  ctx.log(`start the library by hand instead (it stops at logout): ${nohupLine(ctx, port)}`);
  return 1;
}

/**
 * True when a library already answers on this port: its live record names it, or a TCP connect to 127.0.0.1
 * succeeds (a server that did not write a record, or one run by hand). The record alone would miss the latter.
 */
function occupied(ctx: ServiceContext, port: number): boolean {
  const record = localServerUrl({ env: ctx.env, home: userFolder(ctx) });
  if (record && recordPort(record) === port) return true;
  return ctx.listening?.(port) ?? false;
}

/** The pid of the live record when it names this port; undefined otherwise. Only the pid is read, never a token. */
function recordedPid(ctx: ServiceContext, port: number): number | undefined {
  const file = localServerFile(userFolder(ctx));
  if (!existsSync(file)) return undefined;
  const record = readObject(file);
  if (typeof record.pid !== 'number' || !Number.isInteger(record.pid)) return undefined;
  if (typeof record.url !== 'string') return undefined;
  return recordPort(record.url) === port ? record.pid : undefined;
}

/** The port of a recorded url, or undefined when it does not parse (a broken record names no port). */
function recordPort(url: string): number | undefined {
  try {
    const port = Number(new URL(url).port);
    return port || undefined;
  } catch {
    return undefined;
  }
}

function installLinux(ctx: ServiceContext, port: number): number {
  // Probe first: without systemctl there is nothing to load a unit file, so nothing is written.
  if (ctx.run('systemctl', ['--version']).missing) return noSystemd(ctx, port);
  const file = unitPath(ctx);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, unitText(serviceInputs(ctx, port)), { mode: 0o644 });
  ctx.run('systemctl', ['--user', 'daemon-reload']);
  const enable = ctx.run('systemctl', ['--user', 'enable', '--now', UNIT_NAME]);
  if (enable.status !== 0) {
    ctx.log(`systemctl could not start ${UNIT_NAME}: ${enable.stderr.trim() || `exit ${enable.status}`}. Check: systemctl --user status ${UNIT_NAME}`);
    return 1;
  }
  ctx.log(`installed ${file}\nthe library runs on port ${port} and restarts after a crash`);
  // A machine without a desktop login stops user services at logout unless lingering is on. A graphical session
  // keeps them running anyway, so the hint would only be noise there.
  const session = ctx.env.XDG_SESSION_TYPE;
  if (session !== 'x11' && session !== 'wayland') {
    ctx.log(`no desktop login here? keep it running after logout: loginctl enable-linger ${ctx.user}`);
  }
  // An empty library makes `library` exit at once, so systemd gives up after a few restarts: say how to fix it now.
  // Gone entries go to ctx.log too, so the user sees which paths to drop before the hint to add one.
  const { mine } = libraryEntries({ env: { FLOW_TOWER_HOME: userFolder(ctx) }, checkout: ctx.checkout, warn: ctx.log });
  if (mine.length === 0) {
    ctx.log(`your library is empty, so the service cannot start yet: ${cliName()} library add <path>, then: systemctl --user restart ${UNIT_NAME}`);
  }
  return 0;
}

function installMac(ctx: ServiceContext, port: number): number {
  const file = plistPath(ctx);
  mkdirSync(dirname(file), { recursive: true });
  mkdirSync(dirname(logPath(ctx)), { recursive: true });
  writeFileSync(file, plistText({ ...serviceInputs(ctx, port), logFile: logPath(ctx) }), { mode: 0o644 });
  const domain = `gui/${ctx.uid}`;
  // A reinstall replaces a loaded agent: bootout first. It fails when nothing is loaded yet, which is fine.
  ctx.run('launchctl', ['bootout', `${domain}/${AGENT_LABEL}`]);
  const boot = ctx.run('launchctl', ['bootstrap', domain, file]);
  if (boot.status !== 0) {
    ctx.log(`launchctl could not load ${file}: ${boot.stderr.trim() || `exit ${boot.status}`}`);
    return 1;
  }
  ctx.log(`installed ${file}\nthe library runs on port ${port}, starts at login and restarts when it exits\nlog: ${logPath(ctx)}`);
  return 0;
}

function statusLinux(ctx: ServiceContext): number {
  const r = ctx.run('systemctl', ['--user', 'is-active', UNIT_NAME]);
  // Status only reports; it must not suggest installing, which would write a unit that cannot load here.
  if (r.missing) {
    ctx.log('systemd is not available here: the library is not managed as a service');
    return 1;
  }
  const state = r.stdout.trim() || 'unknown';
  if (state === 'active') {
    ctx.log(`flow-tower: running (systemd user service)`);
    return 0;
  }
  // A unit file that exists but is not active is installed and stopped: the fix is to start it, not reinstall.
  if (existsSync(unitPath(ctx))) {
    // A failed unit gave up after its restarts (a crash loop): starting it again fails the same way, so point at the journal.
    if (state === 'failed') {
      ctx.log(`installed but not running (failed): journalctl --user -u ${UNIT_NAME}`);
      return 1;
    }
    ctx.log(`installed but not running: systemctl --user start ${UNIT_NAME}`);
    return 1;
  }
  ctx.log(`flow-tower: not running (${state}). Install it with: ${cliName()} service install`);
  return 1;
}

function statusMac(ctx: ServiceContext): number {
  const r = ctx.run('launchctl', ['print', `gui/${ctx.uid}/${AGENT_LABEL}`]);
  if (r.status !== 0) {
    ctx.log(`flow-tower: not installed. Install it with: ${cliName()} service install`);
    return 1;
  }
  const running = /state = running/.test(r.stdout);
  if (running) {
    ctx.log('flow-tower: running (launchd agent)');
    return 0;
  }
  // The plist exists and launchd knows the agent, but it is not running: bootstrap loads it again.
  ctx.log(`installed but not running: launchctl bootstrap gui/${ctx.uid} ${plistPath(ctx)}`);
  return 1;
}

function uninstallLinux(ctx: ServiceContext): number {
  // Only our unit file is removed. A stop that fails (already stopped, no systemd) does not block the removal.
  ctx.run('systemctl', ['--user', 'disable', '--now', UNIT_NAME]);
  rmSync(unitPath(ctx), { force: true });
  ctx.run('systemctl', ['--user', 'daemon-reload']);
  // A unit that ended failed stays listed as not-found failed until its state is reset; the reset is harmless when it was clean.
  ctx.run('systemctl', ['--user', 'reset-failed', UNIT_NAME]);
  ctx.log(`removed ${unitPath(ctx)}`);
  return 0;
}

function uninstallMac(ctx: ServiceContext): number {
  ctx.run('launchctl', ['bootout', `gui/${ctx.uid}/${AGENT_LABEL}`]);
  rmSync(plistPath(ctx), { force: true });
  ctx.log(`removed ${plistPath(ctx)}`);
  return 0;
}

/** Runs one `flow-tower service` command. Returns the exit code. */
export function runService(argv: string[], ctx: ServiceContext = defaultServiceContext()): number {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string' } } });
  } catch (err) {
    ctx.log(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const action = parsed.positionals[0];
  if (parsed.positionals.length !== 1 || !['install', 'status', 'uninstall'].includes(action)) {
    ctx.log(USAGE);
    return 2;
  }
  const linux = ctx.platform === 'linux';
  const mac = ctx.platform === 'darwin';
  if (!linux && !mac) {
    ctx.log(`service: supported on Linux (systemd) and macOS (launchd) only. Start the library by hand: ${cliName()} library`);
    return 1;
  }
  if (action === 'status') return linux ? statusLinux(ctx) : statusMac(ctx);
  if (action === 'uninstall') return linux ? uninstallLinux(ctx) : uninstallMac(ctx);
  let port: number;
  try {
    port = choosePort(parsed.values.port, ctx);
  } catch (err) {
    ctx.log((err as Error).message);
    return 2;
  }
  // Checked before anything is written: a unit that cannot bind its port would only fail later, out of sight.
  if (occupied(ctx, port)) {
    const pid = recordedPid(ctx, port);
    ctx.log(`a library already runs on port ${port}${pid === undefined ? '' : ` (pid ${pid})`}: stop it first, or pick --port`);
    return 1;
  }
  return linux ? installLinux(ctx, port) : installMac(ctx, port);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runService(process.argv.slice(2)));
}
