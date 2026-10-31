// The real dependencies of the unattended lead (#320). runner-core.mjs runs on injected deps and does no I/O itself;
// this file makes them real. Every effect goes through one injected exec(cmd, args, opts) -> { status, stdout, stderr },
// so the tests run the whole set with a fake and never reach git, gh or OpenRouter.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { env } from 'node:process';
import { loadConfig } from './config.mjs';
import { parseVerdict } from './gate.mjs';
import { ROLES } from './roles.mjs';
import { slugOf } from './runner-plan.mjs';
import { ledgerPath, readRuns, summarize } from './ledger.mjs';

const TASK_NAME = /^[\w.-]+$/;

// A failed git or push call stops the issue, so the error names the command and carries its first stderr line.
const must = (r, what) => {
  if (r.status !== 0) throw new Error(`${what}: ${String(r.stderr ?? '').split('\n')[0]}`);
  return r;
};

// The reviewer's verdict, or null when the answer has none: a verdict that is not JSON counts as no verdict.
function verdictOrNull(text) {
  try { return parseVerdict(text); } catch { return null; }
}

// pack.mjs and gate.mjs read the repo and the review files only, so they get the environment without the model key:
// a child that needs no key should not be able to read one. git and gh get it too: a project's git hooks run inside
// push, and those hooks are repo code the coder may have written.
export function envWithoutKey() {
  const copy = { ...env };
  delete copy.OPENROUTER_API_KEY;
  return copy;
}

// gh is the GitHub adapter from runner-gh.mjs; it is passed in so the runner builds it once and the core reads it here.
export function makeDeps({ repo, home, exec, runner, gh, now = Date.now }) {
  const squadDir = join(home, 'squad-runner');
  const outDir = join(squadDir, 'out');
  // The issue number from the last quality call: gate reads that call's review and security outputs.
  let lastIssue;

  // A fresh file per call, so a rerun never overwrites the task a previous run was given.
  function freshTask(prefix, text) {
    const dir = join(squadDir, 'tasks');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${prefix}-${randomUUID().slice(0, 8)}.md`);
    writeFileSync(file, text);
    return file;
  }

  // The caller names the issue, so every role run is charged to it, whatever its prompt says.
  function role(name, prompt, cwd = repo, issue = undefined) {
    const file = freshTask(name, prompt);
    const args = [join(runner, 'run.mjs'), '--role', name, '--node', ROLES[name].node, '--task', file, '--repo', cwd,
      ...(issue !== undefined ? ['--issue', String(issue)] : [])];
    const r = exec('node', args);
    return { ok: r.status === 0, text: r.stdout };
  }

  // Every git call goes through here, so none of them gets the model key.
  const git = (args) => exec('git', args, { env: envWithoutKey() });

  // The branch and the folder are both derived from the issue, so the same issue always names the same place.
  function worktree(issue) {
    const branch = `squad/${issue.number}-${slugOf(issue.title)}`;
    const path = join(squadDir, 'worktrees', `${basename(repo)}-${issue.number}`);
    mkdirSync(join(squadDir, 'worktrees'), { recursive: true });
    // A failed issue keeps its worktree for inspection; a rerun is a new start, so the old folder is cleared first.
    if (existsSync(path)) git(['-C', repo, 'worktree', 'remove', '--force', path]);
    must(git(['-C', repo, 'fetch', 'origin', 'main']), 'git fetch');
    must(git(['-C', repo, 'worktree', 'add', '-B', branch, path, 'origin/main']), 'git worktree add');
    return { path, branch };
  }

  // The names come from the caller's plan, so a name that escapes the folder (../x.md) is refused before any write.
  function writeTasks(path, n, files) {
    const dir = join(path, 'tools', 'squad', 'tasks', String(n));
    mkdirSync(dir, { recursive: true });
    for (const { name, text } of files) {
      // '.' and '..' match the pattern, and a leading dot would make a hidden file: all three are refused.
      if (!TASK_NAME.test(name) || name === '.' || name === '..' || name.startsWith('.')) {
        throw new Error(`bad task file name: ${name}`);
      }
      writeFileSync(join(dir, name), text);
    }
    return dir;
  }

  // steps.sh is the one place that runs the repo's checks and commits each step. Its output is the evidence on a red run.
  // It comes from the runner folder, never the worktree: the coder may edit the worktree's copy on its branch, and that
  // copy would then run for the next steps. The worktree is only the folder the script works in (REPO).
  function steps(path, dir, issue) {
    const r = exec('bash', [join(runner, 'steps.sh'), String(issue.number), dir, '', `squad #${issue.number}`],
      { env: { ...env, REPO: path } });
    return { ok: r.status === 0, tail: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  }

  // One review pass: the pack is written to a task file, then run. Returns { text } with the run's text, which holds the
  // verdict, or { error } when pack.mjs failed: a failed pack means the role must not run on an empty or partial task.
  function reviewPass(path, n, name, model) {
    const packed = exec('node', [join(runner, 'pack.mjs'), '--role', name, '--issue', String(n), '--repo', path],
      { env: envWithoutKey() });
    if (packed.status !== 0) {
      return { error: `pack failed for ${name}: ${String(packed.stderr ?? '').split('\n')[0]}` };
    }
    const file = freshTask(`${n}-${name}`, packed.stdout);
    const args = [join(runner, 'run.mjs'), '--role', name, '--node', ROLES[name].node, '--task', file,
      '--issue', String(n), '--repo', path, ...(model ? ['--model', model] : [])];
    return { text: exec('node', args).stdout };
  }

  // Security gets one more pass on the reviewer's model when its first answer has no verdict; both outputs are kept.
  // The fallback model comes from the main checkout's config: the worktree's squad.json is the coder's to edit.
  function quality(path, issue) {
    const n = issue.number;
    lastIssue = n;
    const first = reviewPass(path, n, 'reviewer');
    if (first.error) return { ok: false, error: first.error };
    const reviewText = first.text;
    let sec = reviewPass(path, n, 'security');
    if (sec.error) return { ok: false, error: sec.error };
    let securityText = sec.text;
    let security = verdictOrNull(securityText);
    if (!security) {
      sec = reviewPass(path, n, 'security', loadConfig(repo).models.reviewer);
      if (sec.error) return { ok: false, error: sec.error };
      securityText = sec.text;
      security = verdictOrNull(securityText);
    }
    const review = verdictOrNull(reviewText);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${n}-review.out`), reviewText);
    writeFileSync(join(outDir, `${n}-security.out`), securityText);
    const ok = review !== null && security !== null;
    const missing = [review === null && 'reviewer', security === null && 'security'].filter(Boolean);
    return ok ? { ok, review, security } : { ok, review, security, error: `no verdict from ${missing.join(' and ')}` };
  }

  // A rerun recreates the branch from origin/main, so a plain push of a branch already on origin is rejected. The
  // lease makes the force safe: it only replaces the remote branch we last saw. Only the runner's own squad/ branches
  // may be forced, so a bad branch name (main, for one) is refused before git runs.
  function push(path, branch) {
    if (!branch.startsWith('squad/')) throw new Error(`refusing to push ${branch}: not a squad/ branch`);
    must(git(['-C', path, 'push', '--force-with-lease', '-u', 'origin', branch]), 'git push');
  }

  // gate.mjs exits 1 when the PR is not ready, so its exit code is not an error here: the text carries the answer.
  function gate(path, prUrl) {
    const pr = /\/pull\/(\d+)/.exec(String(prUrl ?? ''));
    if (!pr) throw new Error(`no PR number in ${prUrl}`);
    if (lastIssue === undefined) throw new Error('gate ran before quality');
    const n = lastIssue;
    const r = exec('node', [join(runner, 'gate.mjs'), '--pr', pr[1],
      '--review', join(outDir, `${n}-review.out`), '--security', join(outDir, `${n}-security.out`), '--repo', path],
      { env: envWithoutKey() });
    return { ready: String(r.stdout ?? '').startsWith('READY'), text: r.stdout };
  }

  // The cost of one issue, from the shared ledger. An issue with no runs reads 0.
  function spent(n) {
    return summarize(readRuns(ledgerPath({ ...env, FLOW_TOWER_HOME: home })), n).total.cost;
  }

  return { gh, role, worktree, writeTasks, steps, quality, push, gate, spent, now };
}
