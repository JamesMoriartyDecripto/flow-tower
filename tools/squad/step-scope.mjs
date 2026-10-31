// Scope of a squad step's commit (#353). steps.sh used to stage every tracked change (`git add -u`), so a maintainer's
// uncommitted edits went into squad commits, and it reran finished steps. These helpers decide what a step may stage,
// which steps are already done, and which foreign files a step touched. The functions are pure: git runs only in the CLI.
// node tools/squad/step-scope.mjs <subcommand> ...   (see USAGE)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { matchesEntry, parseFiles } from './files-check.mjs';

const USAGE = [
  'usage: node tools/squad/step-scope.mjs snapshot <repo>',
  '       node tools/squad/step-scope.mjs write <task.md> <repo> [write-csv]',
  '       node tools/squad/step-scope.mjs done <issue> <step> <repo>',
  '       node tools/squad/step-scope.mjs stage <task.md> <base-rev> <repo> <snapshot-file> <write-csv>',
  '       node tools/squad/step-scope.mjs outside <task.md> <base-rev> <repo> <snapshot-file> <write-csv>',
  '       node tools/squad/step-scope.mjs foreign-touched <snapshot-file> <repo>',
].join('\n');

// The directory a Files entry lives in, which the step may write. A glob has no fixed directory, so the part before
// its first wildcard decides it. An entry with no "/" there is taken whole: it names a root file or a root folder.
function dirOf(entry) {
  const star = entry.indexOf('*');
  const head = star < 0 ? entry : entry.slice(0, star);
  const slash = head.lastIndexOf('/');
  if (slash >= 0) return head.slice(0, slash);
  return entry.replace(/\/$/, '');
}

// The write dirs of a step: the configured write list plus the directory of every Files entry, so a task may name a
// file outside the configured folders (its own tests, a doc at the root) without widening the config.
// A trailing "/" is stripped before de-duplicating, so "src/" and "src" are the same write dir (no prefix mismatch).
export function writeDirsFor(write, files) {
  const dirs = [...write, ...files.map(dirOf)].map((d) => d.replace(/\/+$/, ''));
  return [...new Set(dirs)];
}

// A subject ends with the step marker that steps.sh writes on each commit, so a step counts as done only when its
// own commit is in the log. The "(#issue)" part keeps issue 35 from matching issue 353.
export function stepDone(subjects, step, issue) {
  const tail = `, step ${step} (#${issue})`;
  return subjects.some((s) => s.endsWith(tail));
}

// The changed paths a step may stage. A foreign path is never staged, even when the step's own folders contain it:
// it belongs to the maintainer. Otherwise a path must sit under a write dir or match one of the task's Files entries.
export function toStage(changed, foreign, writeDirs, files) {
  const skip = new Set(foreign);
  return changed.filter((p) => {
    if (skip.has(p)) return false;
    if (writeDirs.some((d) => p === d || p.startsWith(d + '/'))) return true;
    return files.some((e) => matchesEntry(e, p));
  });
}

// A Files entry must name a path inside the repo. An absolute entry or a ".." segment would give a write dir outside
// it, so a step could write anywhere on disk. A drive-letter or backslash entry is absolute on Windows, and git
// reads a backslash as a separator there, so both are refused too.
export function badEntries(files) {
  return files.filter((e) => e.startsWith('/') || /^[A-Za-z]:[\\/]/.test(e) || e.includes('\\') || e.split('/').includes('..'));
}

// The foreign paths a step changed: the hash differs, or the file is gone (a "-" hash marks a missing file).
export function touchedForeign(before, after) {
  return Object.keys(before).filter((p) => after[p] !== before[p]);
}

// Every path git reports as changed, tracked or untracked. Porcelain -z gives a rename as "XY new\0old\0", so the
// old name is skipped: only the path that exists now counts.
function statusPaths(repo) {
  const out = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: repo, encoding: 'utf8', maxBuffer: 20e6 });
  const tokens = out.split('\0');
  const paths = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    paths.push(t.slice(3));
    if (/[RC]/.test(t.slice(0, 2))) i++;
  }
  return [...new Set(paths)];
}

// Hashes of many paths in one git call. A missing path gets "-" and is not sent to git, which would fail on it.
function hashPaths(repo, paths) {
  const present = paths.filter((p) => existsSync(join(repo, p)));
  const hashes = present.length
    ? execFileSync('git', ['hash-object', '--stdin-paths'], { cwd: repo, encoding: 'utf8', input: `${present.join('\n')}\n`, maxBuffer: 20e6 })
      .split('\n').filter(Boolean)
    : [];
  const byPath = new Map(present.map((p, i) => [p, hashes[i]]));
  return Object.fromEntries(paths.map((p) => [p, byPath.get(p) ?? '-']));
}

// Snapshot file lines are "<hash>\t<path>", as the snapshot command prints them.
function readSnapshot(file) {
  const map = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) map[line.slice(tab + 1)] = line.slice(0, tab);
  }
  return map;
}

// Subjects of the commits since the base. A base that does not resolve (a fresh clone, a typo) falls back to the
// last 200 commits, so a step is never wrongly reported as not done for want of a base. When HEAD is the base or an
// ancestor of it, "base..HEAD" is empty by construction and would hide every done step, so the fallback applies too.
function subjectsSince(repo, base) {
  const resolves = spawnSync('git', ['rev-parse', '--verify', '-q', `${base}^{commit}`], { cwd: repo }).status === 0;
  const headBehind = resolves && spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', base], { cwd: repo }).status === 0;
  const args = resolves && !headBehind ? ['log', '--format=%s', `${base}..HEAD`] : ['log', '--format=%s', '-n', '200'];
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
}

const splitCsv = (csv) => (csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : []);

// Paths from a git list written with -z: NUL-separated and never quoted, so a name with non-ASCII or a backslash
// matches the path on disk. The trim is gone too, since a name may start or end with a space.
function nulList(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 20e6 }).split('\0').filter(Boolean);
}

// Tracked changes since the base plus untracked files, deduplicated.
const changedSince = (repo, baseRev) => [...new Set([
  ...nulList(repo, ['diff', '--name-only', '-z', baseRev]),
  ...nulList(repo, ['ls-files', '--others', '--exclude-standard', '-z']),
])];

function main(args) {
  const [cmd, ...rest] = args;
  const write = (taskFile, repo, csv) => {
    const files = parseFiles(readFileSync(taskFile, 'utf8'));
    const bad = badEntries(files);
    if (bad.length) throw new Error(`Files: entries must stay inside the repository: ${bad.join(', ')}`);
    const cfgWrite = splitCsv(csv);
    return writeDirsFor(cfgWrite.length ? cfgWrite : loadConfig(repo).write, files);
  };
  // What a step may stage, with the inputs it was computed from. stage and outside both use it.
  const stageOf = (taskFile, baseRev, repo, snapFile, csv) => {
    const changed = changedSince(repo, baseRev);
    const foreign = Object.keys(readSnapshot(snapFile));
    const files = parseFiles(readFileSync(taskFile, 'utf8'));
    const staged = toStage(changed, foreign, write(taskFile, repo, csv), files);
    return { changed, foreign, staged };
  };
  if (cmd === 'snapshot' && rest.length === 1) {
    const repo = rest[0];
    const paths = statusPaths(repo);
    const hashes = hashPaths(repo, paths);
    console.log(paths.map((p) => `${hashes[p]}\t${p}`).join('\n'));
    return 0;
  }
  if (cmd === 'write' && (rest.length === 2 || rest.length === 3)) {
    const [taskFile, repo, csv = ''] = rest;
    console.log(write(taskFile, repo, csv).join(','));
    return 0;
  }
  if (cmd === 'done' && rest.length === 3) {
    const [issue, step, repo] = rest;
    const subjects = subjectsSince(repo, loadConfig(repo).base);
    console.log(stepDone(subjects, step, issue) ? 'yes' : 'no');
    return 0;
  }
  if (cmd === 'stage' && rest.length === 5) {
    const [taskFile, baseRev, repo, snapFile, csv] = rest;
    console.log(stageOf(taskFile, baseRev, repo, snapFile, csv).staged.join('\n'));
    return 0;
  }
  // Changed paths that are neither foreign nor staged: the coder changed them outside the step's scope.
  if (cmd === 'outside' && rest.length === 5) {
    const [taskFile, baseRev, repo, snapFile, csv] = rest;
    const { changed, foreign, staged } = stageOf(taskFile, baseRev, repo, snapFile, csv);
    const skip = new Set([...foreign, ...staged]);
    console.log(changed.filter((p) => !skip.has(p)).join('\n'));
    return 0;
  }
  if (cmd === 'foreign-touched' && rest.length === 2) {
    const [snapFile, repo] = rest;
    const before = readSnapshot(snapFile);
    const after = hashPaths(repo, Object.keys(before));
    console.log(touchedForeign(before, after).join('\n'));
    return 0;
  }
  throw new Error(USAGE);
}

// Runs as the CLI only when executed directly, so the tests can import the functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`step scope: ${e.message}`);
    process.exitCode = 2;
  }
}
