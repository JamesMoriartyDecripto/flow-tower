// The one command an author runs (npm run dry | pilot | render). It starts the scratch
// instance, runs Argo once per planned run, builds the contact sheet, and always stops
// the instance it started. Every decision lives in plan.mjs; this file only does the I/O.
import { spawn } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkTutorial,
  expandCommand,
  forbiddenStrings,
  parseArgs,
  pilotScenes,
  planRuns,
} from './plan.mjs';

const SHUTDOWN_MS = 5000;
const READY_MS = 60000;
const POLL_MS = 500;
const PROBE_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Any HTTP response counts as "something answers"; null means nothing answered in time.
async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_MS) });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

function tail(file, lines) {
  try {
    return readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log written)';
  }
}

// Resolves with the exit code; a signal or a spawn error is never reported as success.
function runChild(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
}

// Shared by the normal exit and the signal handlers, so the instance is stopped once
// whichever path ends the run first.
const instance = { child: null, home: null, logFd: null, stopped: false };

async function stopInstance() {
  if (instance.stopped) return;
  instance.stopped = true;
  const { child } = instance;
  // pid is undefined when spawn failed; such a child never emits 'exit', so waiting would hang.
  if (child && child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), SHUTDOWN_MS);
    await exited;
    clearTimeout(force);
  }
  if (instance.logFd !== null) closeSync(instance.logFd);
  if (instance.home !== null) rmSync(instance.home, { recursive: true, force: true });
}

// Environment values are never printed: the OpenRouter key may be among them.
async function startInstance(app, logPath) {
  const env = { ...process.env };
  // The recorded app never holds the paid key; only the Argo child, which speaks, gets it.
  delete env.OPENROUTER_API_KEY;
  if (app.homeEnv) {
    // An empty user folder keeps tokens and private projects out of the recording.
    instance.home = mkdtempSync(join(tmpdir(), 'tutorial-home-'));
    env[app.homeEnv] = instance.home;
  }
  const argv = expandCommand(app.command, process.env);
  instance.logFd = openSync(logPath, 'w');
  const child = spawn(argv[0], argv.slice(1), { env, stdio: ['ignore', instance.logFd, instance.logFd] });
  instance.child = child;
  let spawnError = null;
  child.once('error', (err) => {
    spawnError = err;
  });
  const deadline = Date.now() + READY_MS;
  for (;;) {
    const status = await probe(app.url);
    if (status !== null && status >= 200 && status < 300) return true;
    if (spawnError || child.exitCode !== null || child.signalCode !== null) break;
    if (Date.now() >= deadline) break;
    await sleep(POLL_MS);
  }
  if (spawnError) console.error(spawnError.message);
  console.error(`the app did not answer 2xx on ${app.url}; last lines of ${logPath}:`);
  console.error(tail(logPath, 20));
  return false;
}

// Each run gets its own folder, so Argo's cache and output never mix two voices.
async function prepareRun(root, dir, demo, scenes) {
  const demosDir = join(dir, 'demos');
  await mkdir(demosDir, { recursive: true });
  const sources = (await readdir(join(root, 'demos'))).filter((f) => f.endsWith('.ts'));
  await Promise.all([
    ...sources.map((f) => copyFile(join(root, 'demos', f), join(demosDir, f))),
    writeFile(join(demosDir, `${demo}.scenes.json`), JSON.stringify(scenes, null, 2) + '\n'),
  ]);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const tutorial = checkTutorial(JSON.parse(readFileSync(join(root, 'tutorial.json'), 'utf8')));
  const manifest = JSON.parse(readFileSync(join(root, 'demos', `${args.demo}.scenes.json`), 'utf8'));
  const { url } = tutorial.app;

  // A shared server must never be recorded or restarted, so an existing one is a hard stop.
  if ((await probe(url)) !== null) {
    console.error(`something already listens on ${url}: stop it or change the port in tutorial.json`);
    return 1;
  }

  const runsDir = join(root, 'runs');
  await mkdir(runsDir, { recursive: true });
  const logPath = join(runsDir, 'app.log');
  const onSignal = (code) => () => {
    stopInstance().finally(() => process.exit(code));
  };
  process.on('SIGINT', onSignal(130));
  process.on('SIGTERM', onSignal(143));

  const forbidden = forbiddenStrings({ user: userInfo().username, host: hostname(), home: homedir() });
  const configPath = join(root, 'argo.config.mjs');
  try {
    if (!(await startInstance(tutorial.app, logPath))) return 1;
    for (const run of planRuns(tutorial, args.mode)) {
      const dir = join(runsDir, run.name);
      const scenes = args.mode === 'pilot' ? pilotScenes(manifest, tutorial.pilotUntil) : manifest;
      await prepareRun(root, dir, args.demo, scenes);

      const argoArgs = ['--no-install', 'argo', 'pipeline', args.demo, '-c', configPath];
      if (args.headed) argoArgs.push('--headed');
      const env = {
        ...process.env,
        TUTORIAL_URL: url,
        TUTORIAL_FORBIDDEN: JSON.stringify(forbidden),
        ...run.env,
      };
      // The tower's scene check runs on every run, so a stale video is checked again too.
      const checkCode = await runChild(
        'npx',
        ['--no-install', 'argo', 'validate', args.demo, '-c', configPath],
        { cwd: dir, stdio: 'inherit', env },
      );
      if (checkCode !== 0) {
        console.error(
          `run ${run.name} failed: the scene check found a mismatch between the manifest and the demo script`,
        );
        return 1;
      }

      const argoCode = await runChild('npx', argoArgs, { cwd: dir, stdio: 'inherit', env });
      if (argoCode !== 0) {
        console.error(`run ${run.name} failed: Argo names the scene it stopped in above`);
        return 1;
      }

      const sheetCode = await runChild(
        process.execPath,
        [join(root, 'scripts', 'sheet.mjs'), dir, args.demo],
        { stdio: 'inherit' },
      );
      if (sheetCode !== 0) {
        console.error(`run ${run.name} failed: the contact sheet could not be built`);
        return 1;
      }
      console.log(join(dir, 'videos', `${args.demo}.mp4`));
      console.log(join(dir, 'sheet.html'));
    }
    return 0;
  } finally {
    await stopInstance();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err.message);
    process.exitCode = 1;
  },
);
