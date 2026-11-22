// Starts one isolated Flow Tower instance for a verification run, checks it, and stops it (#448).
// Each run gets its own FLOW_TOWER_HOME, so the server never reads the user's config or joins a hub,
// and the port is refused when something already answers there (it may be someone's live server).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 5327;
const READY_TIMEOUT_MS = 90_000;
const POLL_MS = 500;
const STOP_WAIT_MS = 5_000;
const COMMANDS = ['launch', 'doctor', 'stop', 'open', 'events', 'validate'];

const USAGE = `usage: verify.mjs <command> [options]

commands:
  launch   start an isolated instance on a free port (--port, --base)
  doctor   check the last (or --run) instance without changing it
  stop     stop the instance's server and remove its home (--run)
  open     <project> [--keys k1,k2]: open a project as a user, record the store after each key
  events   <project> --node <layer.node>: post tool events, click the error row in the live feed
  validate <path>: run the CLI validate --json and keep its output (needs a run folder, not a server)

options:
  --port <n>     port for launch (default ${DEFAULT_PORT})
  --base <dir>   folder holding the runs (default <tmp>/flow-tower-verify)
  --run <dir>    run folder for doctor, stop and the evidence of a drive (default: the one in <base>/current)
  --name <label> names the evidence files (default: the command)
  --keys <list>  keys to press in order, e.g. PageDown,Enter (open)
  --node <id>    node the events drive selects (events)
  --help         show this help`;

/** Parses the CLI flags. Pure: the defaults are computed here, nothing is read from disk. */
export function parseArgs(argv) {
  const args = { command: undefined, target: undefined, help: false, port: DEFAULT_PORT, base: join(tmpdir(), 'flow-tower-verify'), run: undefined, name: undefined, node: undefined, keys: [], unknown: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--base') args.base = resolve(argv[++i]);
    else if (a === '--run') args.run = resolve(argv[++i]);
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--node') args.node = argv[++i];
    else if (a === '--keys') args.keys = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a.startsWith('--')) args.unknown = a;
    else if (args.command === undefined) args.command = a;
    else if (args.target === undefined) args.target = a;
    else args.unknown = a;
  }
  return args;
}

/** The run.json fields known before launch. The run folder is <base>/<runId>. */
export function planRun({ base, port, now = new Date() }) {
  // The ISO stamp has no ':' or '.', so the id is a valid folder name on every platform.
  const runId = `${now.toISOString().replace(/[:.]/g, '-')}-${port}`;
  const dir = join(base, runId);
  return {
    runId,
    port,
    url: `http://127.0.0.1:${port}`,
    home: join(dir, 'home'),
    evidence: join(dir, 'evidence'),
    startedAt: now.toISOString(),
  };
}

function git(args) {
  return execFileSync('git', args, { cwd: HERE, encoding: 'utf8', timeout: 20_000 }).trim();
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Asks /api/workspace. Null when nothing answers; otherwise the status and the project list. */
async function probe(url) {
  try {
    const res = await fetch(`${url}/api/workspace`, { signal: AbortSignal.timeout(2000) });
    let projects = [];
    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      projects = Array.isArray(body.projects) ? body.projects : [];
    }
    return { status: res.status, projects };
  } catch {
    return null;
  }
}

/** A raw TCP connect: catches a port that is open but does not speak HTTP yet. */
function tcpOpen(port) {
  return new Promise((done) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    sock.setTimeout(1000);
    sock.once('connect', () => { sock.destroy(); done(true); });
    sock.once('timeout', () => { sock.destroy(); done(false); });
    sock.once('error', () => done(false));
  });
}

/** Signals the recorded process group (the server runs detached), else the PID alone. */
function signalRun(pid, signal) {
  // pid 0 or less would address our own group or every process: refuse it.
  if (!(pid > 0)) return false;
  try { process.kill(-pid, signal); return true; } catch { /* no group: try the PID */ }
  try { process.kill(pid, signal); return true; } catch { return false; }
}

function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function tail(file, lines) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').slice(-lines - 1).join('\n') : '';
}

/** The run folder: --run, else the path the last launch wrote to <base>/current. */
function runDirOf(args) {
  if (args.run) return args.run;
  const current = join(args.base, 'current');
  return existsSync(current) ? readFileSync(current, 'utf8').trim() : undefined;
}

async function launch(args) {
  const url = `http://127.0.0.1:${args.port}`;
  // Refuse before creating anything: a live server on this port is not ours to restart.
  if ((await probe(url)) || (await tcpOpen(args.port))) {
    console.log(`port ${args.port} is in use: pick another with --port`);
    return 1;
  }
  const plan = planRun({ base: args.base, port: args.port });
  const dir = join(args.base, plan.runId);
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
    env: { ...process.env, FLOW_TOWER_HOME: plan.home, FLOW_TOWER_NO_UPDATE_CHECK: '1' },
  });
  // The child holds its own copy of the log descriptor; ours is no longer needed.
  closeSync(fd);
  child.on('exit', gone).on('error', gone);
  child.unref();

  writeFileSync(join(dir, 'run.json'), JSON.stringify({ ...plan, pid: child.pid, commit: git(['rev-parse', 'HEAD']) }, null, 2) + '\n');
  writeFileSync(join(args.base, 'current'), dir + '\n');

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!exited && Date.now() < deadline) {
    const r = await probe(url);
    if (r?.status === 200 && r.projects.length > 0) {
      console.log(`ready ${url}`);
      console.log(`run ${dir}`);
      console.log(`projects ${r.projects.length}`);
      return 0;
    }
    await sleep(POLL_MS);
  }
  console.log(exited ? 'the server exited before it was ready' : `the server was not ready within ${READY_TIMEOUT_MS / 1000} s`);
  signalRun(child.pid, 'SIGTERM');
  console.log(tail(log, 20));
  return 1;
}

/** Reads run.json from a run folder; null (with a FAIL line printed) when it is missing or broken. */
function readRun(dir) {
  const file = dir ? join(dir, 'run.json') : undefined;
  try {
    return { dir, run: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    console.log(`FAIL run.json: cannot read ${file ?? 'a run folder (none launched yet)'}`);
    return null;
  }
}

async function doctor(args) {
  const found = readRun(runDirOf(args));
  if (!found) return 1;
  const { run } = found;
  const [alive, probed, head] = [pidAlive(run.pid), await probe(run.url), git(['rev-parse', 'HEAD'])];
  const lines = [
    [true, 'run.json', `${found.dir}/run.json`],
    [alive, 'pid', alive ? `${run.pid} is running` : `${run.pid} is not running`],
    [probed?.status === 200 && probed.projects.length > 0, 'workspace',
      probed?.status === 200 ? `${probed.projects.length} projects, first 5: ${probed.projects.slice(0, 5).join(', ')}` : `no 200 from ${run.url}/api/workspace`],
    [run.commit === head, 'commit', run.commit === head ? head : `launched at ${run.commit}, checkout is at ${head}`],
  ];
  for (const [ok, name, detail] of lines) console.log(`${ok ? 'ok   ' : 'FAIL '}${name}: ${detail}`);
  return lines.every(([ok]) => ok) ? 0 : 1;
}

async function stop(args) {
  const found = readRun(runDirOf(args));
  if (!found) return 1;
  const { dir, run } = found;
  signalRun(run.pid, 'SIGTERM');
  const deadline = Date.now() + STOP_WAIT_MS;
  while (Date.now() < deadline && (await probe(run.url))) await sleep(200);
  if (await probe(run.url)) signalRun(run.pid, 'SIGKILL');
  // Only the home goes: the evidence and the log are what the run leaves for review.
  rmSync(join(dir, 'home'), { recursive: true, force: true });
  console.log(`stopped pid ${run.pid}`);
  console.log(`evidence kept in ${join(dir, 'evidence')}`);
  return 0;
}

/** The workspace as the running server reports it: the project ids and the towers behind them. */
async function workspaceOf(url) {
  const res = await fetch(`${url}/api/workspace`, { signal: AbortSignal.timeout(5000) });
  return res.json();
}

/** The first project id that starts with the prefix; undefined when none does (the caller lists the ids). */
function resolveProject(ids, prefix) {
  return ids.find((id) => id.startsWith(prefix));
}

function evidenceOf(run) {
  mkdirSync(run.evidence, { recursive: true });
  return run.evidence;
}

/** Writes one evidence file and prints its path, so the record of a drive is easy to find. */
function writeEvidence(dir, file, content) {
  const path = join(dir, file);
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

/** The store fields a drive records, read through the dev hook as e2e/fixtures.ts does. */
function readState(page) {
  return page.evaluate(() => {
    const s = window.__flowTower.store.getState();
    return { stack: s.stack, library: s.library, selected: s.selected, focusedLayer: s.focusedLayer, view: s.view };
  });
}

/** Opens a project the way a user does: the library card, then the tower on screen with a real canvas. */
async function openAsUser(page, url, id) {
  await page.goto(`${url}/?quality=eco`);
  await page.locator(`[data-card="${id}"]`).click();
  // The app loads by dynamic import, so the hook can appear after goto: wait for it, then for the tower.
  await page.waitForFunction(() => '__flowTower' in window, undefined, { timeout: 30_000 });
  await page.waitForFunction((pid) => {
    const r = document.querySelector('canvas')?.getBoundingClientRect();
    return window.__flowTower.store.getState().stack[0] === pid && !!r && r.width > 100 && r.height > 100;
  }, id, { timeout: 30_000 });
}

/**
 * Runs one drive in a fresh installed Chrome, as playwright.config.ts does. A failed expectation prints FAIL
 * and is reported back, so the caller still writes the evidence it has. Playwright loads here only.
 */
async function inBrowser(shot, fn) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const consoleErrors = [];
  let ok = true;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    try {
      await fn(page);
    } catch (e) {
      ok = false;
      console.log(`FAIL ${String(e.message).split('\n')[0]}`);
    }
    await page.screenshot({ path: shot });
    console.log(`wrote ${shot}`);
  } finally {
    await browser.close();
  }
  return { ok, consoleErrors };
}

/** Reads the run, resolves the project prefix against the live workspace; null (FAIL printed) when either fails. */
async function projectOf(args) {
  const found = readRun(runDirOf(args));
  if (!found) return null;
  const ws = await workspaceOf(found.run.url);
  const id = args.target && resolveProject(ws.projects, args.target);
  if (!id) {
    console.log(`FAIL no project matches ${args.target ?? '(none given)'}; first 5: ${ws.projects.slice(0, 5).join(', ')}`);
    return null;
  }
  return { ...found, id, ws };
}

async function openDrive(args) {
  const found = await projectOf(args);
  if (!found) return 1;
  const { run, id } = found;
  const label = args.name ?? 'open';
  const evidence = evidenceOf(run);
  const steps = [];
  const { ok, consoleErrors } = await inBrowser(join(evidence, `${label}.png`), async (page) => {
    await openAsUser(page, run.url, id);
    steps.push({ action: 'open', state: await readState(page) });
    for (const key of args.keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
      steps.push({ action: key, state: await readState(page) });
    }
  });
  writeEvidence(evidence, `${label}.json`, JSON.stringify({ project: id, url: `${run.url}/?quality=eco`, steps, consoleErrors }, null, 2) + '\n');
  return ok ? 0 : 1;
}

/** Posts one event as a Claude Code hook does: the endpoint answers 204 with no body. */
async function postEvent(url, body) {
  const res = await fetch(`${url}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  return { status: res.status, bodyLength: text.length };
}

async function eventsDrive(args) {
  if (!args.node) {
    console.log('FAIL events needs --node <layer.node>');
    return 1;
  }
  const found = await projectOf(args);
  if (!found) return 1;
  const { run, id, ws } = found;
  const label = args.name ?? 'events';
  const evidence = evidenceOf(run);
  const tower = ws.towers[id].id;
  const tag = `verify-${Date.now()}`;
  const bodies = [
    { kind: 'tool.start', source: tag, node: args.node, tower, message: `${tag} start`, call: tag },
    { kind: 'tool.end', source: tag, node: args.node, tower, status: 'error', message: `${tag} error`, call: tag },
    { kind: 'tool.start', source: tag, agent: 'nobody-matches-this', message: `${tag} unmapped` },
  ];
  const rec = { project: id, node: args.node, posts: [], feedRows: undefined, selected: undefined };
  const { ok, consoleErrors } = await inBrowser(join(evidence, `${label}.png`), async (page) => {
    await openAsUser(page, run.url, id);
    await page.keyboard.press('f');
    await page.locator('.livefeed').waitFor({ timeout: 15_000 });
    rec.posts = await Promise.all(bodies.map((b) => postEvent(run.url, b)));
    const bad = rec.posts.filter((p) => p.status !== 204 || p.bodyLength !== 0);
    if (bad.length) throw new Error(`events answered ${JSON.stringify(bad)}, expected 204 with no body`);
    // The row arrives after the server has the event: wait for the error row, then click it as a user does.
    await page.locator('.feed-row', { hasText: `${tag} error` }).first().click({ timeout: 15_000 });
    await page.waitForFunction((n) => window.__flowTower.store.getState().selected === n, args.node, { timeout: 15_000 });
    rec.feedRows = await page.locator('.feed-row').count();
    rec.selected = (await readState(page)).selected;
  });
  writeEvidence(evidence, `${label}.json`, JSON.stringify({ ...rec, consoleErrors }, null, 2) + '\n');
  return ok ? 0 : 1;
}

/** Runs the CLI validate on a path and keeps its output. Needs the run folder for evidence, not a server. */
function validateDrive(args) {
  const found = readRun(runDirOf(args));
  if (!found) return 1;
  if (!args.target) {
    console.log('FAIL validate needs a path');
    return 1;
  }
  const argv = ['bin/flow-tower.js', 'validate', resolve(args.target), '--json'];
  const r = spawnSync(process.execPath, argv, { cwd: git(['rev-parse', '--show-toplevel']), encoding: 'utf8', timeout: 60_000 });
  const exit = r.status ?? 1;
  writeEvidence(evidenceOf(found.run), `${args.name ?? 'validate'}.json`, JSON.stringify({ command: `node ${argv.join(' ')}`, exit, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n');
  if (exit !== 0) console.log(`FAIL validate exited ${exit}`);
  return exit;
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
  if (args.command === 'open') return openDrive(args);
  if (args.command === 'events') return eventsDrive(args);
  if (args.command === 'validate') return validateDrive(args);
  return stop(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
