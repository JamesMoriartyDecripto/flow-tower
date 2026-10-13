/**
 * `flow-tower service install|status|uninstall [--port N]` (#194): runs the local library as a user service,
 * so the hooks always reach a running server and no event is lost to a refused connection. Linux gets a
 * systemd user unit, macOS a launchd agent. Every command goes through `run`, so tests fake it and never
 * touch the real home, systemd or launchd. Everything that touches the home folder takes a context.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { localServerUrl } from '../../bin/local-server.js';
import { shellQuote } from '../../bin/cli-name.js';

const DEFAULT_PORT = 5317;
const UNIT_NAME = 'flow-tower';
const UNIT_FILE = `${UNIT_NAME}.service`;
const AGENT_LABEL = 'dev.flowtower.library';
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
  log: (line: string) => void;
}

export function defaultServiceContext(): ServiceContext {
  return {
    home: homedir(),
    env: process.env,
    checkout: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
    node: process.execPath,
    platform: process.platform,
    uid: process.getuid?.() ?? 0,
    user: userInfo().username,
    run: (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', missing: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' };
    },
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

/**
 * One word for a systemd ExecStart or Environment= line (systemd.syntax): a value with spaces, quotes or
 * backslashes is double-quoted, with `\` and `"` escaped inside. `$` and `%` are doubled in every case, or
 * systemd would expand them as environment variables and unit specifiers.
 */
export function systemdWord(value: string): string {
  const escaped = value.replaceAll('%', '%%').replaceAll('$', '$$$$').replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return /[\s"\\]/.test(value) ? `"${escaped}"` : escaped;
}

/** XML text for a plist: the five predefined entities, so a `&` or `<` in a path stays data. */
export function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** The library's argv after the Node binary and the CLI script: the same command the hooks rely on. */
function libraryArgs(cli: string, port: number): string[] {
  return [cli, 'library', '--no-open', '--port', String(port)];
}

/** The systemd user unit. Restart=on-failure brings the library back after a crash, not after a clean stop. */
export function unitText({ node, cli, port, home }: { node: string; cli: string; port: number; home?: string }): string {
  const exec = [node, ...libraryArgs(cli, port)].map(systemdWord).join(' ');
  const env = home ? `Environment=${systemdWord(`FLOW_TOWER_HOME=${home}`)}\n` : '';
  return `[Unit]
Description=flow-tower library
After=network.target

[Service]
ExecStart=${exec}
${env}Restart=on-failure

[Install]
WantedBy=default.target
`;
}

/**
 * The launchd agent. RunAtLoad starts it at login; KeepAlive with SuccessfulExit=false restarts it only when
 * it exits with a failure, the launchd equivalent of Restart=on-failure (a bare `true` would restart it even
 * after a clean stop). Output goes to one log file the user can read.
 */
export function plistText({ node, cli, port, home, logFile }: { node: string; cli: string; port: number; home?: string; logFile: string }): string {
  const args = [node, ...libraryArgs(cli, port)].map((a) => `    <string>${xml(a)}</string>`).join('\n');
  const env = home
    ? `  <key>EnvironmentVariables</key>\n  <dict>\n    <key>FLOW_TOWER_HOME</key>\n    <string>${xml(home)}</string>\n  </dict>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${env}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logFile)}</string>
</dict>
</plist>
`;
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
  // A machine without a desktop login stops user services at logout unless lingering is on.
  ctx.log(`no desktop login here? keep it running after logout: loginctl enable-linger ${ctx.user}`);
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
  ctx.log(`flow-tower: not running (${state}). Install it with: flow-tower service install`);
  return 1;
}

function statusMac(ctx: ServiceContext): number {
  const r = ctx.run('launchctl', ['print', `gui/${ctx.uid}/${AGENT_LABEL}`]);
  if (r.status !== 0) {
    ctx.log('flow-tower: not installed. Install it with: flow-tower service install');
    return 1;
  }
  const running = /state = running/.test(r.stdout);
  ctx.log(running ? 'flow-tower: running (launchd agent)' : 'flow-tower: loaded but not running');
  return running ? 0 : 1;
}

function uninstallLinux(ctx: ServiceContext): number {
  // Only our unit file is removed. A stop that fails (already stopped, no systemd) does not block the removal.
  ctx.run('systemctl', ['--user', 'disable', '--now', UNIT_NAME]);
  rmSync(unitPath(ctx), { force: true });
  ctx.run('systemctl', ['--user', 'daemon-reload']);
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
    ctx.log(`service: supported on Linux (systemd) and macOS (launchd) only. Start the library by hand: flow-tower library`);
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
  return linux ? installLinux(ctx, port) : installMac(ctx, port);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runService(process.argv.slice(2)));
}
