// Starts one isolated Flow Tower instance for a verification run, checks it, and stops it (#448).
// Each run gets its own FLOW_TOWER_HOME, so the server never reads the user's config or joins a hub,
// and the port is refused when something already answers there (it may be someone's live server).
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 5327;
const READY_TIMEOUT_MS = 90_000;
const POLL_MS = 500;
const STOP_WAIT_MS = 5_000;
const COMMANDS = ['launch', 'doctor', 'stop'];

const USAGE = `usage: verify.mjs <command> [options]

commands:
  launch   start an isolated instance on a free port (--port, --base)
  doctor   check the instance of --run <dir> without changing it
  stop     stop the instance's server and remove its home (--run)

options:
  --port <n>       port for launch (default ${DEFAULT_PORT})
  --base <dir>     folder holding the runs (default <tmp>/flow-tower-verify)
  --run <dir>      run folder for doctor and stop (required; launch prints it)
  --project <id>   project id or prefix doctor must find in the workspace
  --help           show this help`;

function parseArgs(argv) {
  const args = { command: undefined, help: false, port: DEFAULT_PORT, base: join(tmpdir(), 'flow-tower-verify'), run: undefined, project: undefined, unknown: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--base') args.base = resolve(argv[++i]);
    else if (a === '--run') args.run = resolve(argv[++i]);
    else if (a === '--project') args.project = argv[++i];
    else if (a.startsWith('--')) args.unknown = a;
    else if (args.command === undefined) args.command = a;
    else args.unknown = a;
  }
  return args;
}

/** The run.json fields known before launch. The run folder is <base>/<runId>. */
function planRun({ base, port }) {
  const now = new Date();
  // The ':' and '.' of the ISO stamp are replaced so the id is a valid folder name on every platform.
  const runId = `${now.toISOString().replace(/[:.]/g, '-')}-${port}`;
  const dir = join(base, runId);
  return {
    dir,
    runId,
    port,
    url: `http://127.0.0.1:${port}`,
    home: join(dir, 'home'),
    evidence: join(dir, 'evidence'),
    startedAt: now.toISOString(),
  };
}

/**
 * The parsed /api/workspace body when it has the shape launch and doctor read; null otherwise. Checking the shape
 * keeps a 200 with some other JSON from throwing a TypeError (#448).
 */
async function workspaceOf(url, timeoutMs) {
  try {
    const res = await fetch(`${url}/api/workspace`, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 200) return null;
    const body = await res.json();
    if (Array.isArray(body?.projects) && body.towers && typeof body.towers === 'object') return body;
  } catch { /* refused, timed out or not JSON: null */ }
  return null;
}

function git(args) {
  return execFileSync('git', args, { cwd: HERE, encoding: 'utf8', timeout: 20_000 }).trim();
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** A server that answers HTTP also accepts the TCP connect, so the connect alone decides. */
function portInUse(port) {
  return new Promise((done) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    sock.setTimeout(1000);
    sock.once('connect', () => { sock.destroy(); done(true); });
    sock.once('timeout', () => { sock.destroy(); done(false); });
    sock.once('error', () => done(false));
  });
}

/** Signals the recorded process group (the server runs detached in its own process group). */
function signalRun(pid, signal) {
  // pid 0 addresses our own group and pid 1 addresses -1, every process the user owns: refuse both.
  if (!(pid > 1)) return false;
  try { process.kill(-pid, signal); return true; } catch { return false; }
}

function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function tail(file, lines) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').slice(-lines - 1).join('\n') : '';
}

// A FLOW_TOWER_HUB or FLOW_TOWER_TOKEN from the shell would make the scratch server join that hub with that credential, so they are dropped.
function isolatedEnv(home) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('FLOW_TOWER_')));
  return { ...env, FLOW_TOWER_HOME: home, FLOW_TOWER_NO_UPDATE_CHECK: '1' };
}

async function launch(args) {
  if (!Number.isInteger(args.port) || args.port < 1024 || args.port > 65535) {
    console.log('--port needs a number from 1024 to 65535');
    return 2;
  }
  const url = `http://127.0.0.1:${args.port}`;
  // Refuse before creating anything: a live server on this port is not ours to restart.
  if (await portInUse(args.port)) {
    console.log(`port ${args.port} is in use: pick another with --port`);
    return 1;
  }
  // The runs hold a server's home and evidence, so a base that another user owns is not written into.
  if (existsSync(args.base) && process.getuid && statSync(args.base).uid !== process.getuid()) {
    console.log(`FAIL ${args.base} belongs to another user: pass --base`);
    return 1;
  }
  mkdirSync(args.base, { recursive: true, mode: 0o700 });
  const plan = planRun({ base: args.base, port: args.port });
  const { dir } = plan;
  mkdirSync(plan.home, { recursive: true });
  mkdirSync(plan.evidence, { recursive: true });

  const log = join(dir, 'server.log');
  const fd = openSync(log, 'a');
  const root = git(['rev-parse', '--show-toplevel']);
  let exited = false;
  const gone = () => { exited = true; };
  const child = spawn(process.execPath, ['bin/flow-tower.js', 'examples', '--no-open', '--port', String(args.port)], {
    cwd: root,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: isolatedEnv(plan.home),
  });
  // The child holds its own copy of the log descriptor; ours is no longer needed.
  closeSync(fd);
  child.on('exit', gone).on('error', gone);
  child.unref();

  writeFileSync(join(dir, 'run.json'), JSON.stringify({ ...plan, pid: child.pid, commit: git(['rev-parse', 'HEAD']) }, null, 2) + '\n');

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!exited && Date.now() < deadline) {
    const ws = await workspaceOf(url, 2000);
    if (ws && ws.projects.length > 0) {
      console.log(`ready ${url}`);
      console.log(`run ${dir}`);
      console.log(`projects ${ws.projects.length}`);
      // No shared pointer to the last run: each agent names its own run, so concurrent launches never collide (#448).
      console.log(`next doctor --run ${dir}`);
      console.log(`next stop --run ${dir}`);
      return 0;
    }
    await sleep(POLL_MS);
  }
  console.log(exited ? 'the server exited before it was ready' : `the server was not ready within ${READY_TIMEOUT_MS / 1000} s`);
  signalRun(child.pid, 'SIGTERM');
  console.log(tail(log, 20));
  return 1;
}

/**
 * The only reader of run.json. Its fields are checked before anything is signalled, removed or written, since a
 * bad value would reach a RegExp, a process group or a path (#448). Returns { dir, run }, or null with one FAIL line.
 * evidence and home always come from the run folder, never from the file.
 */
function readRun(dir) {
  const file = join(dir, 'run.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.log(`FAIL run.json: cannot read ${file}`);
    return null;
  }
  const problem = runProblem(dir, raw);
  if (problem) {
    console.log(`FAIL run.json: ${problem}`);
    return null;
  }
  return { dir, run: { ...raw, evidence: join(dir, 'evidence'), home: join(dir, 'home') } };
}

/** Why a parsed run.json cannot be trusted, or null when every field it has is in range. */
function runProblem(dir, raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'not a JSON object';
  const { pid, port, url } = raw;
  if (pid !== undefined) {
    // A pid of 0 or 1 would reach signalRun as a group that is not the server's.
    if (!(Number.isInteger(pid) && pid > 1)) return `pid ${pid} is not a server PID`;
    // Only a folder launch named may be removed, so a launched run must say which folder it is.
    if (raw.runId !== basename(dir)) return `runId ${JSON.stringify(raw.runId)} is not the run folder name ${basename(dir)}`;
  }
  if (port !== undefined && !(Number.isInteger(port) && port >= 1024 && port <= 65535)) {
    return `port ${JSON.stringify(port)} is not a number from 1024 to 65535`;
  }
  if (url !== undefined) {
    // With a port the URL must be that port on 127.0.0.1; without one, only digits may follow the address.
    const ok = port !== undefined ? url === `http://127.0.0.1:${port}` : /^http:\/\/127\.0\.0\.1:\d+$/.test(url);
    if (!ok) return `url ${JSON.stringify(url)} is not http://127.0.0.1:<port>`;
  }
  return null;
}

/** Without a named run, doctor and stop would act on whichever instance was started last (#448). */
function runRequired(args) {
  if (args.run) return false;
  console.log('FAIL --run <dir> is required: launch prints the run folder');
  return true;
}

async function doctor(args) {
  if (runRequired(args)) return 1;
  const found = readRun(args.run);
  if (!found) return 1;
  const { run } = found;
  const [alive, ws, head] = [pidAlive(run.pid), await workspaceOf(run.url, 2000), git(['rev-parse', 'HEAD'])];
  // A prefix is enough to name a project, so --project confirms the one an agent is about to drive is served.
  const served = (ws?.projects ?? []).find((id) => id === args.project || id.startsWith(args.project));
  const lines = [
    [true, 'run.json', `${found.dir}/run.json`],
    [alive, 'pid', alive ? `${run.pid} is running` : `${run.pid} is not running`],
    [ws !== null && ws.projects.length > 0, 'workspace',
      ws ? `${ws.projects.length} projects, first 5: ${ws.projects.slice(0, 5).join(', ')}` : `no 200 from ${run.url}/api/workspace`],
    ...(args.project === undefined ? [] : [[served !== undefined, 'project', served ?? `no project matches ${args.project}`]]),
    [run.commit === head, 'commit', run.commit === head ? head : `launched at ${run.commit}, checkout is at ${head}`],
  ];
  for (const [ok, name, detail] of lines) console.log(`${ok ? 'ok   ' : 'FAIL '}${name}: ${detail}`);
  return lines.every(([ok]) => ok) ? 0 : 1;
}

/** True when the command line passes --port <port> as a whole argument. Plain text, so the port never becomes a pattern. */
function hasPortFlag(cmd, port) {
  return cmd.split(`--port ${port}`).slice(1).some((rest) => rest === '' || rest.startsWith(' ') || rest.startsWith('\n'));
}

/** The command line of a PID, or null when no such process exists. */
function commandLineOf(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

async function stop(args) {
  if (runRequired(args)) return 1;
  const found = readRun(args.run);
  if (!found) return 1;
  const { dir, run } = found;
  // run.json can outlive its server: after a reboot the PID may belong to another process, so it is checked first.
  const cmd = commandLineOf(run.pid);
  const ours = cmd !== null && cmd.includes('flow-tower.js') && hasPortFlag(cmd, run.port);
  if (cmd !== null && !ours) {
    console.log(`FAIL pid ${run.pid} is not this run's server: nothing was signalled`);
    return 1;
  }
  if (ours) signalRun(run.pid, 'SIGTERM');
  const deadline = Date.now() + STOP_WAIT_MS;
  while (Date.now() < deadline && (await workspaceOf(run.url, 2000))) await sleep(200);
  if (ours && (await workspaceOf(run.url, 2000))) signalRun(run.pid, 'SIGKILL');
  // Only the home goes: the evidence and the log are what the run leaves for review.
  rmSync(join(dir, 'home'), { recursive: true, force: true });
  // A server that still answers keeps its Vite cache, since the cache is in use until the server is gone.
  if (run.port !== undefined && !(await workspaceOf(run.url, 2000))) removeViteCache(run.port);
  console.log(`stopped pid ${run.pid}`);
  console.log(`evidence kept in ${join(dir, 'evidence')}`);
  return 0;
}

/** Each server start leaves node_modules/.vite/port-<port> in the checkout, which git status cannot show (#448). */
function removeViteCache(port) {
  const cache = join(git(['rev-parse', '--show-toplevel']), 'node_modules', '.vite', `port-${port}`);
  if (!existsSync(cache)) return;
  rmSync(cache, { recursive: true, force: true });
  console.log(`removed the Vite cache of port ${port}`);
}

async function main(argv) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.log(`Node 22.13 or newer is needed (this is ${process.version})`);
    return 2;
  }
  const args = parseArgs(argv);
  if (args.help || args.command === undefined) {
    console.log(USAGE);
    return 0;
  }
  if (args.unknown !== undefined || !COMMANDS.includes(args.command)) {
    console.log(`unknown ${args.unknown ?? args.command}\n${USAGE}`);
    return 2;
  }
  if (args.command === 'launch') return launch(args);
  if (args.command === 'doctor') return doctor(args);
  return stop(args);
}

// An error no drive expected ends here as one FAIL line; a stack trace would only show the script's internals.
main(process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    console.log(`FAIL ${String(e.message).split('\n')[0]}`);
    process.exitCode = 1;
  });
