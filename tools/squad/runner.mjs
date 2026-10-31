// The unattended lead (#320) as a command: it polls the squad:go queue and works one issue at a time, on this laptop.
// node tools/squad/runner.mjs [--once] [--issue <n>] [--repo <path>] [--dry-run]
// One runner per home folder: a lock file holds the pid, so two runners never claim from the same queue at once.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { env, argv, exit } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { envWithoutKey, makeDeps } from './runner-deps.mjs';
import { makeGh } from './runner-gh.mjs';
import { workIssue } from './runner-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: node tools/squad/runner.mjs [--once] [--issue <n>] [--repo <path>] [--dry-run]';
const ISSUE_FIELDS = 'number,title,body,labels,createdAt';
const SIGNAL_REPORT_MS = 10000;

// The queue label: gh issue view lists labels as objects with a name. Pure, so the --issue rule is testable.
export function isQueued(labels) {
  return Array.isArray(labels) && labels.some((l) => l?.name === 'squad:go');
}

// Plain argument parsing: the runner takes four flags, so no parser library is needed. A bad value throws with the usage.
export function parseArgs(args) {
  const out = { once: false, issue: undefined, repo: undefined, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--once') out.once = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--issue' || a === '--repo') {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value\n${USAGE}`);
      if (a === '--repo') out.repo = v;
      else if (!/^[1-9]\d*$/.test(v)) throw new Error(`--issue must be a positive issue number, got "${v}"`);
      else out.issue = Number(v);
    } else throw new Error(`unknown argument: ${a}\n${USAGE}`);
  }
  return out;
}

const defaultIsAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

// Takes the lock with an exclusive create, so two runners cannot both win. A lock whose pid is dead is stale and is
// replaced once; a lock held by a live pid is refused, and the holder's pid is returned so the message can name it.
export function acquireLock(path, pid, isAlive = defaultIsAlive) {
  mkdirSync(dirname(path), { recursive: true });
  const tryCreate = () => {
    try { writeFileSync(path, String(pid), { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  };
  if (tryCreate()) return { ok: true };
  const holder = Number(readFileSync(path, 'utf8').trim());
  if (Number.isInteger(holder) && holder > 0 && isAlive(holder)) return { ok: false, pid: holder };
  rmSync(path, { force: true });
  if (tryCreate()) return { ok: true };
  return { ok: false, pid: Number(readFileSync(path, 'utf8').trim()) };
}

// Removes the lock only when it still holds our pid, so a runner never deletes a lock another runner took over.
export function releaseLock(path, pid) {
  try { if (readFileSync(path, 'utf8').trim() === String(pid)) rmSync(path, { force: true }); } catch { /* already gone */ }
}

// The real process call behind the deps: arrays only, no shell. A missing binary or a signal reads as a failure.
// A timeout makes spawnSync kill the child and return an ETIMEDOUT error, which reads as a failure here.
function realExec(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input: opts.input, cwd: opts.cwd, env: opts.env ?? env,
    maxBuffer: 64 * 1024 * 1024, timeout: opts.timeout });
  // A timed-out child gives an empty stderr, so the error message (ETIMEDOUT) is the reason, not the empty string.
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr || r.error?.message || '' };
}

// The direct gh and git calls in main(): the same key-less env as the deps, since a git hook runs repo code.
const quietExec = (cmd, args, opts = {}) => realExec(cmd, args, { ...opts, env: envWithoutKey() });

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// The polling loop's decision after a failed queue read. A one-shot run (--once or --issue) reports the error and exits;
// a polling runner keeps going, because one transient gh failure must not stop an unattended lead. Pure, so it is testable.
export function nextAction({ once, error }) {
  return once ? 'exit' : 'retry';
}

// The first line of an error, so a long gh trace does not flood the log.
const firstLine = (e) => String(e?.message ?? e).split('\n')[0];

// The one place the deps are built: main and the tests both call it, so a dep the core needs cannot go missing here.
// gh runs without the model key, the same as the git calls in runner-deps.mjs.
export function buildDeps({ repo, home, exec, runner, nameWithOwner }) {
  const gh = makeGh((cmd, args, opts = {}) => exec(cmd, args, { ...opts, env: opts.env ?? envWithoutKey() }), nameWithOwner);
  return makeDeps({ repo, home, exec, runner, gh });
}

async function main(args) {
  const opts = parseArgs(args);
  let repo = opts.repo;
  if (repo === undefined) {
    // Outside a checkout the runner has no repo to work in, so it stops here with the folder it was started from.
    const top = quietExec('git', ['rev-parse', '--show-toplevel']);
    if (top.status !== 0) throw new Error(`not a git repository: ${process.cwd()}`);
    repo = top.stdout.trim();
  }
  repo = resolve(repo);
  const home = env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower');
  const config = loadConfig(repo);
  const limits = { usdPerIssue: config.runner.usdPerIssue, minutes: config.runner.minutes, fixRounds: config.runner.fixRounds };

  // gh needs owner/name for -R; the repo's own remote gives it, so the runner never guesses a repository.
  const named = quietExec('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd: repo });
  if (named.status !== 0) throw new Error(`gh repo view failed: ${named.stderr.split('\n')[0]}`);
  const nameWithOwner = named.stdout.trim();
  const deps = buildDeps({ repo, home, exec: realExec, runner: HERE, nameWithOwner });

  const fetchOne = (n) => JSON.parse(quietExec('gh', ['issue', 'view', String(n), '-R', nameWithOwner, '--json', ISSUE_FIELDS]).stdout);
  // --issue works an issue only when it carries squad:go, so a manual run cannot skip the queue's label rule.
  const nextIssues = () => {
    if (opts.issue === undefined) return deps.gh.queue();
    const issue = fetchOne(opts.issue);
    if (!isQueued(issue.labels)) throw new Error(`#${opts.issue} is not labelled squad:go`);
    return [issue];
  };

  if (opts.dryRun) {
    const issues = nextIssues();
    console.log(`limits: ${JSON.stringify(limits)} pollMinutes: ${config.runner.pollMinutes}`);
    console.log(issues.length ? issues.map((i) => `#${i.number} ${i.title}`).join('\n') : 'queue empty');
    return 0;
  }

  // The lock is taken before any claim, so a second runner exits here instead of racing the first one.
  const lock = join(home, 'squad-runner', 'lock');
  const me = process.pid;
  const got = acquireLock(lock, me);
  if (!got.ok) throw new Error(`another runner is working (pid ${got.pid})`);
  const release = () => releaseLock(lock, me);
  // The issue in progress, so a signal can report it as failed instead of leaving it squad:running with no comment.
  let current;
  // Signals exit through process.exit, so the 'exit' handler above still removes the lock. The report is best effort:
  // gh is synchronous, so a hang can only be cut by the child timeout. The report gets one 10 s deadline in total, and
  // each gh call gets what is left of it; a failure is printed and ignored.
  let stopping = false;
  const onSignal = (code) => {
    if (stopping) return;
    stopping = true;
    if (current !== undefined) {
      const deadline = Date.now() + SIGNAL_REPORT_MS;
      const signalGh = makeGh((cmd, args, o = {}) => realExec(cmd, args,
        { ...o, env: envWithoutKey(), timeout: Math.max(1, deadline - Date.now()) }), nameWithOwner);
      try {
        signalGh.fail(current, 'runner stopped (signal)');
      } catch (e) {
        console.error(`could not report the stop of #${current}: ${firstLine(e)}`);
      }
    }
    release();
    exit(code);
  };
  process.on('exit', release);
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(sig, () => { onSignal(code); });

  const once = opts.once || opts.issue !== undefined;
  // A pass per poll: the first issue of the queue, one at a time. The sleep is the poll gap, not a retry delay.
  for (;;) {
    let issues;
    try {
      issues = nextIssues();
    } catch (e) {
      if (nextAction({ once, error: e }) === 'exit') throw e;
      console.log(`poll failed: ${firstLine(e)}`);
      await sleep(config.runner.pollMinutes * 60000);
      continue;
    }
    if (!issues.length) console.log('queue empty');
    else {
      const issue = issues[0];
      current = issue.number;
      const outcome = await workIssue(issue, deps, limits);
      current = undefined;
      console.log(`#${issue.number} -> ${outcome}`);
    }
    if (once) return 0;
    await sleep(config.runner.pollMinutes * 60000);
  }
}

// Run directly, not imported: tests import the helpers above without starting a loop.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main(argv.slice(2)).then((code) => { exit(code); }, (e) => { console.error(e.message); exit(1); });
}
