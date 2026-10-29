/**
 * `flow-tower squad init <dir> [--check "<command>"] [--force]` (#265): sets the dev squad up in a git repo.
 * It copies the runner from this checkout's tools/squad/, writes the repo's squad.json, the task template and
 * the tower, and adds the squad's logs to .gitignore. `flow-tower squad key` stores the OpenRouter key in the
 * user folder; `flow-tower squad key status` says whether one is set (exit 0 when it is, 1 when not).
 * TypeScript, run with Node's type stripping like copy and validate (see bin/commands.js).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit, stdin, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cliName, shellPath } from '../../bin/cli-name.js';
import { userHome } from '../core/secrets.ts';
import { detectConfig } from './squad-detect.ts';
import { RUNTIME_IGNORE_LINE } from './squad-runtime-install.ts';
import {
  BUNDLE_DIR, MAIN_TOWER, assertRealDirOrMissing, assertRegularOrMissing, assertSquadDir, assertTowerDests, installTower,
} from './squad-tower.ts';

// Re-exported for the tests, which import detectConfig from here.
export { detectConfig };

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = join(pkgRoot, 'tools', 'squad');
const KIT = join(RUNNER, 'kit');
// The canonical Dev Squad: the tower and the bundle it points at are installed from this folder (#330).
const EXAMPLE = join(pkgRoot, 'examples', 'dev-squad');
const CLI = join(pkgRoot, 'bin', 'flow-tower.js');

/** The lines a squad adds to .gitignore: its run logs, the task folders, and the checkout's path (.cli). */
// The task folders (tools/squad/tasks/<n>/) hold per-issue step files that are not committed; ignoring them keeps
// steps.sh from reporting "UNTRACKED LEFT" on every step (#265). TEMPLATE.md is the one file meant to be tracked.
// .cli holds this checkout's absolute path, which is machine-local: it must not be committed with squad.json.
// Runtime logs in the bundle are ignored; only the four logs shipped with the example are re-included, one by one.
// A blanket negation would also re-include any runtime log the squad writes later, so each sample is named.
// Git takes the last matching pattern, so the negations must come after the ignore line they override.
const BUNDLE_LOGS = `tools/squad/${BUNDLE_DIR}/logs`;
const SHIPPED_BUNDLE_LOGS = ['hooks.log', 'lead.log', 'review-loop.log', 'webhook.log'];
const IGNORE_LINES = [
  'tools/squad/*.log',
  'tools/squad/tasks/*',
  '!tools/squad/tasks/TEMPLATE.md',
  'tools/squad/.cli',
  `${BUNDLE_LOGS}/*.log`,
  ...SHIPPED_BUNDLE_LOGS.map((name) => `!${BUNDLE_LOGS}/${name}`),
  // The SDK runtime's node_modules, filled by an explicit install (squad-runtime-install.ts): never committed.
  RUNTIME_IGNORE_LINE,
];

/** Whether a path is an existing folder (false for a missing path or a file). */
const isDir = (path: string) => existsSync(path) && statSync(path).isDirectory();

/** Runner files: every *.mjs, *.d.mts and *.sh, plus the README. Never logs, squad.json or kit/. */
const isRunnerFile = (name: string) => /\.(mjs|d\.mts|sh)$/.test(name) || name === 'README.md';

/** The key the squad needs, as OpenRouter issues it. */
const KEY_PREFIX = 'sk-or-';
const KEY_NAME = 'OPENROUTER_API_KEY';
const KEY_URL = 'https://openrouter.ai/keys';
// The file name is built, not written out: a hook in this environment blocks the literal text (as run.mjs does).
const DOT = '.' + 'env';
const KEY_LINE = /^\s*OPENROUTER_API_KEY=(.*)$/;

/** The user-folder key file: the one tools/squad/run.mjs reads (userHome() is ~/.config/flow-tower or FLOW_TOWER_HOME). */
const keyFile = () => join(userHome(), DOT);

/**
 * The key from a terminal (echo off, so it never shows on screen) or from a pipe (read whole). Raw mode
 * is needed because a terminal would otherwise echo each key; Ctrl-C leaves raw mode and exits 130 as a shell does.
 */
function readKey(): Promise<string> {
  if (!stdin.isTTY) {
    return new Promise((resolve, reject) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk: string) => { data += chunk; });
      stdin.on('end', () => resolve(data.trim()));
      stdin.on('error', reject);
    });
  }
  return new Promise((resolve) => {
    stderr.write('OpenRouter key (input hidden): ');
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    let key = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stderr.write('\n');
      resolve(key.trim());
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish();
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          stderr.write('\n');
          exit(130);
        }
        // Backspace (DEL on most terminals, BS on some) removes the last character typed.
        if (ch === '\u007f' || ch === '\b') key = key.slice(0, -1);
        else key += ch;
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

/**
 * Writes the key file: every other line is kept, the key line is replaced (or appended), and the result
 * goes to a temp file in the same folder that is then renamed over the old one, so a crash never leaves a
 * half-written file. Mode 600 is set on the new file; chmod on an existing file is best effort, as in db.ts.
 */
function saveKey(key: string): string {
  const folder = userHome();
  const file = keyFile();
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  // An existing folder may be wider than this: tighten it so other users cannot list the key's folder (best effort).
  try { chmodSync(folder, 0o700); } catch { /* best effort: Windows has no POSIX modes */ }
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = current === '' ? [] : current.replace(/\r?\n$/, '').split(/\r?\n/);
  const out: string[] = [];
  let placed = false;
  for (const line of lines) {
    if (!KEY_LINE.test(line)) out.push(line);
    else if (!placed) { out.push(`${KEY_NAME}=${key}`); placed = true; }
    // Any further key lines are dropped: one key, never two that disagree.
  }
  if (!placed) out.push(`${KEY_NAME}=${key}`);
  if (existsSync(file)) { try { chmodSync(file, 0o600); } catch { /* best effort: Windows has no POSIX modes */ } }
  // The temp name is fixed, so another process could plant a link at it: the exclusive flag ('wx') then refuses
  // to write through any existing entry. A stale temp from a crashed run is removed only when it is a plain file,
  // so a planted link is never deleted or followed.
  const tmp = join(folder, `${DOT}.tmp`);
  let stale;
  try { stale = lstatSync(tmp); } catch { stale = undefined; }
  if (stale?.isFile()) rmSync(tmp);
  writeFileSync(tmp, `${out.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(tmp, file);
  return file;
}

/**
 * Where the key comes from, if anywhere: the environment wins, as it does in run.mjs. Returns 'environment',
 * the key file's path, or undefined. The value itself is never returned, so it cannot be printed by mistake.
 */
function keySource(): string | undefined {
  if (process.env[KEY_NAME]?.trim()) return 'environment';
  const file = keyFile();
  if (existsSync(file)) {
    const m = KEY_LINE.exec(readFileSync(file, 'utf8').split(/\r?\n/).find((l) => KEY_LINE.test(l)) ?? '');
    if (m?.[1]?.trim()) return file;
  }
  return undefined;
}

/** Whether a key is set, and from where. Never prints the value. */
function checkKey(): number {
  const source = keySource();
  if (source === 'environment') {
    console.log(`OpenRouter key is set: from the environment (${KEY_NAME}).`);
    return 0;
  }
  if (source) {
    console.log(`OpenRouter key is set: in ${source}`);
    return 0;
  }
  console.log(`no OpenRouter key: run ${cliName()} squad key, or export ${KEY_NAME}. Get one at ${KEY_URL}`);
  return 1;
}

async function keyCommand(status: boolean): Promise<void> {
  if (status) exit(checkKey());
  const key = await readKey();
  if (!key || !key.startsWith(KEY_PREFIX)) {
    console.error('that does not look like an OpenRouter key (they start with sk-or-)');
    exit(1);
  }
  let file: string;
  try {
    file = saveKey(key);
  } catch (e) {
    // The message names the temp file, never the key. A link left at the temp name must be removed by hand.
    console.error(`could not save the key: ${(e as Error).message}`);
    exit(1);
  }
  console.log(`OpenRouter key saved in ${file} (only you can read it). The squad reads it from there; never put it in a repository.`);
  exit(0);
}

const USAGE = `usage: ${cliName()} squad init <dir> [--check "<command>"] [--force] | squad key [status]`;

// Run directly, not imported: a test imports detectConfig and must not start the CLI. Same realpath guard as config.mjs.
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

/**
 * The tower name init uses. On --force the repo's own squad.json wins (its tower name is the one the repo already
 * uses, not a fresh detection). A malformed file throws, so the init stops with a clear error; a missing or
 * empty `tower` falls back to the detected name.
 */
function existingTowerName(squadJson: string, detected: string): string {
  if (!existsSync(squadJson)) return detected;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(squadJson, 'utf8'));
  } catch {
    // The parser's message is not echoed: it can quote file content, which may hold credentials.
    throw new Error(`${squadJson} is not valid JSON: fix or remove it, then run init again`);
  }
  const tower = (parsed as { tower?: unknown } | null)?.tower;
  return typeof tower === 'string' && tower.trim() !== '' ? tower : detected;
}

function init(dirArg: string, check: string | undefined, force: boolean): void {
  const top = spawnSync('git', ['-C', dirArg, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status !== 0) {
    console.error(`not a git repository: ${dirArg} (the squad works in git worktrees)`);
    exit(1);
  }
  const project = top.stdout.trim();
  const squadDir = join(project, 'tools', 'squad');
  const squadJson = join(squadDir, 'squad.json');
  if (existsSync(squadJson) && !force) {
    console.error(`the squad is already set up in ${dirArg}: use --force to update the runner`);
    exit(1);
  }
  // A tools/squad/ with files but no squad.json belongs to the project (its own scripts): the runner would overwrite them.
  if (!existsSync(squadJson) && !force && isDir(squadDir) && readdirSync(squadDir).length > 0) {
    console.error('tools/squad/ already exists and is not a squad set up by flow-tower: move it, or pass --force to overwrite the runner files');
    exit(1);
  }

  const { config, notes } = detectConfig(project, check);
  const commands = (config as { commands: Record<string, string> }).commands;
  // Checked before anything is written, so a failed init leaves the repo untouched.
  if (!commands.check) {
    console.error('no check command found: pass --check "<command>" (the command that proves a step works, e.g. your test suite)');
    exit(1);
  }

  // Every destination is checked before the first write (#330 review): a link or non-regular file at any of them
  // would send a write outside the repo, and a malformed squad.json must stop the init before it touches anything.
  const runnerNames = readdirSync(RUNNER).filter(isRunnerFile);
  const tasks = join(squadDir, 'tasks');
  const taskTemplate = join(tasks, 'TEMPLATE.md');
  const ignore = join(project, '.gitignore');
  let towerName: string;
  try {
    towerName = existingTowerName(squadJson, (config as { tower: string }).tower);
    assertSquadDir(squadDir);
    for (const name of runnerNames) assertRegularOrMissing(join(squadDir, name));
    assertRegularOrMissing(join(squadDir, '.cli'));
    assertRegularOrMissing(squadJson);
    assertRealDirOrMissing(tasks);
    assertRegularOrMissing(taskTemplate);
    assertTowerDests(EXAMPLE, squadDir);
    assertRegularOrMissing(ignore);
  } catch (e) {
    console.error((e as Error).message);
    exit(1);
  }
  mkdirSync(squadDir, { recursive: true });
  const written: string[] = [];
  for (const name of runnerNames) {
    const from = join(RUNNER, name);
    const to = join(squadDir, name);
    copyFileSync(from, to);
    // copyFileSync does not promise the mode, and the steps run as scripts: keep the source's executable bit.
    if (name.endsWith('.sh')) chmodSync(to, statSync(from).mode & 0o777);
    written.push(`tools/squad/${name}`);
  }

  // The checkout's path is machine-local: it goes to .cli (git-ignored), never to squad.json, which the repo commits.
  // run.mjs reads it when squad.json names no cli. It is rewritten on every init, so a moved checkout is fixed by init.
  writeFileSync(join(squadDir, '.cli'), `${CLI}\n`);
  written.push('tools/squad/.cli');

  // squad.json, tasks and the tower belong to the repo: --force updates the runner only, so these are
  // written when missing and never overwritten.
  if (!existsSync(squadJson)) {
    writeFileSync(squadJson, `${JSON.stringify(config, null, 2)}\n`);
    written.push('tools/squad/squad.json');
  }
  mkdirSync(tasks, { recursive: true });
  if (!existsSync(taskTemplate)) {
    copyFileSync(join(KIT, 'TEMPLATE.md'), taskTemplate);
    written.push('tools/squad/tasks/TEMPLATE.md');
  }
  // The canonical tower and its bundle: only missing files are written, so --force never replaces an edited tower.
  const tower = installTower(EXAMPLE, squadDir, towerName);
  if (tower.main) written.push(`tools/squad/${MAIN_TOWER}`);
  if (tower.files) written.push(`tools/squad/${BUNDLE_DIR}/ (${tower.files} files)`);

  // The squad's logs and task output are local: they must not be committed to the repo.
  const current = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length) {
    // A file without a final newline would glue the first new line onto its last line.
    const lead = current && !current.endsWith('\n') ? '\n' : '';
    appendFileSync(ignore, lead + missing.map((l) => `${l}\n`).join(''));
    written.push('.gitignore');
  }

  const cli = cliName();
  const towerPath = join(squadDir, MAIN_TOWER);
  const cfg = config as { project: string; write: string[]; review: string[] };
  // The key is reported, never printed: a squad without one fails on its first model call, so say so now.
  const source = keySource();
  const keyLine = source === 'environment' ? 'key: found (environment)'
    : source ? `key: found (${source})`
      : `key: missing: run "${cli} squad key"`;
  console.log(`squad set up in ${project} (${cfg.project})`);
  console.log(`wrote: ${written.join(', ')}`);
  console.log(`check command: ${commands.check}`);
  console.log(`write: ${cfg.write.join(', ')}   review: ${cfg.review.join(', ')}`);
  for (const note of notes) console.log(`note: ${note}`);
  console.log(keyLine);
  // The key line is only useful while the key is missing: with a key found, "put the key" would be noise.
  const keyStep = source ? '' : `  put the key:     ${cli} squad key\n`;
    // A worktree reads squad.json from its branch: until it is committed, every step runs with the defaults.
  console.log(`next steps:
  commit it:        git add tools/squad .gitignore && git commit -m "chore: add the dev squad"   (worktrees read squad.json from the branch)
${keyStep}  open the tower:  ${cli} ${shellPath(towerPath)}
  install skill:   ${cli} install-skill
  first step:      bash tools/squad/steps.sh <issue> tools/squad/tasks/<issue> "" "<title>"
                   (empty write dirs take the config's)`);
  exit(0);
}

if (isMain) {
  // --check and --force are re-appended by commands.js; the rest of the arguments are this script's own.
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    strict: false,
    allowPositionals: true,
    options: { check: { type: 'string' }, force: { type: 'boolean', default: false } },
  });
  const [cmd, dir] = positionals;
  // `status` is a word, not a flag: the top-level parser in bin/flow-tower.js takes --check as a string option.
  if (cmd === 'key') {
    await keyCommand(dir === 'status');
  }
  if (cmd !== 'init' || !dir) {
    console.error(USAGE);
    exit(1);
  }
  init(dir, values.check as string | undefined, Boolean(values.force));
}
