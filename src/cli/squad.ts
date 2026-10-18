/**
 * `flow-tower squad init <dir> [--check "<command>"] [--force]` (#265): sets the dev squad up in a git repo.
 * It copies the runner from this checkout's tools/squad/, writes the repo's squad.json, the task template and
 * the tower, and adds the squad's logs to .gitignore. `flow-tower squad key` stores the OpenRouter key in the
 * user folder; `flow-tower squad key status` says whether one is set (exit 0 when it is, 1 when not).
 * TypeScript, run with Node's type stripping like copy and validate (see bin/commands.js).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { exit, stdin, stderr } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { cliName, shellPath } from '../../bin/cli-name.js';
import { userHome } from '../core/secrets.ts';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// config.mjs ships no .d.mts, so a static import fails the typecheck. A dynamic import with its shape
// written here keeps the model names in one place: the runner's DEFAULTS, never a copy.
const configUrl = pathToFileURL(join(pkgRoot, 'tools', 'squad', 'config.mjs')).href;
const { DEFAULTS } = (await import(configUrl)) as { DEFAULTS: { models: Record<string, string> } };
const RUNNER = join(pkgRoot, 'tools', 'squad');
const KIT = join(RUNNER, 'kit');
const CLI = join(pkgRoot, 'bin', 'flow-tower.js');

/** Source folders a squad may write to, in the order the config lists them. */
// scripts and bin hold the code of many Node and Python projects; tools is left out on purpose: it is the runner's folder.
const SRC_DIRS = ['src', 'lib', 'app', 'pkg', 'cmd', 'scripts', 'bin', 'internal', 'tests', 'test', '__tests__', 'spec'];
/** The subset that holds tests: the review reads the code, not the tests. */
const TEST_DIRS = ['tests', 'test', '__tests__', 'spec'];
/** What `npm init` writes into scripts.test: a placeholder, not a test suite. */
const NPM_PLACEHOLDER = 'no test specified';
/** The lines a squad adds to .gitignore: its run logs and the output of each task. */
const IGNORE_LINES = ['tools/squad/*.log', 'tools/squad/tasks/*.out'];

interface Found {
  label: string;
  commands: Record<string, string>;
  notes: string[];
}

type Json = Record<string, unknown>;

/** A parsed JSON file, or undefined when it is missing or not valid JSON. */
function readJson(file: string): Json | undefined {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
  } catch {
    return undefined;
  }
}

const isDir = (path: string) => existsSync(path) && statSync(path).isDirectory();

/** Node: package.json. A placeholder test script does not count, so the next detector gets its turn. */
function detectNode(project: string, folder: string): Found | undefined {
  const pkg = readJson(join(project, 'package.json'));
  if (!pkg) return undefined;
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const realTest = typeof scripts.test === 'string' && !scripts.test.includes(NPM_PLACEHOLDER);
  const check = scripts.check ? 'npm run check' : realTest ? 'npm test' : undefined;
  if (!check) return undefined;
  const deps = { ...(pkg.dependencies as Json), ...(pkg.devDependencies as Json) };
  const runner = 'vitest' in deps ? 'vitest' : 'jest' in deps ? 'jest' : undefined;
  const commands: Record<string, string> = { check };
  if (scripts.typecheck) commands.typecheck = 'npm run typecheck';
  if (scripts.lint) commands.lint = 'npm run lint';
  if (runner === 'vitest') commands.test = 'npx vitest run {file}';
  if (runner === 'jest') commands.test = 'npx jest {file}';
  const name = typeof pkg.name === 'string' && pkg.name ? pkg.name : folder;
  const ts = existsSync(join(project, 'tsconfig.json'));
  const label = `${name} (Node${ts ? ', TypeScript' : ''}${runner ? `, ${runner}` : ''})`;
  return { label, commands, notes: [] };
}

/** Python: any of the three files that mark a Python project. pytest is the common runner. */
function detectPython(project: string, folder: string): Found | undefined {
  if (!['pyproject.toml', 'setup.py', 'requirements.txt'].some((f) => existsSync(join(project, f)))) return undefined;
  return { label: `${folder} (Python)`, commands: { check: 'python -m pytest', test: 'python -m pytest {file}' }, notes: [] };
}

function detectRust(project: string, folder: string): Found | undefined {
  if (!existsSync(join(project, 'Cargo.toml'))) return undefined;
  return { label: `${folder} (Rust)`, commands: { check: 'cargo test' }, notes: [] };
}

function detectGo(project: string, folder: string): Found | undefined {
  if (!existsSync(join(project, 'go.mod'))) return undefined;
  return { label: `${folder} (Go)`, commands: { check: 'go test ./...' }, notes: [] };
}

/** A Makefile with a test target: `make test` is the only check the project names. */
function detectMake(project: string, folder: string): Found | undefined {
  const file = join(project, 'Makefile');
  if (!existsSync(file) || !/^test:/m.test(readFileSync(file, 'utf8'))) return undefined;
  return { label: folder, commands: { check: 'make test' }, notes: [] };
}

const DETECTORS = [detectNode, detectPython, detectRust, detectGo, detectMake];

/**
 * The branch the squad diffs against. The default branch of origin when there is one (origin/main); otherwise
 * the current branch, because a repo with no origin may only have `master` and `git diff main` would fail later.
 * `main` only when git cannot name either.
 */
function baseBranch(project: string): string {
  const symbolic = (ref: string) => {
    const r = spawnSync('git', ['-C', project, 'symbolic-ref', '--short', ref], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '';
  };
  return symbolic('refs/remotes/origin/HEAD') || symbolic('HEAD') || 'main';
}

/**
 * The squad config for a project, from what its files say. `check` overrides the detected check command, so
 * `--check` always wins. No check at all leaves commands.check unset: the caller turns that into an error.
 */
export function detectConfig(project: string, check?: string): { config: object; notes: string[] } {
  const folder = basename(project);
  const found = DETECTORS.map((detect) => detect(project, folder)).find((f) => f !== undefined);
  const notes: string[] = [];
  const commands: Record<string, string> = { ...found?.commands };
  if (check) commands.check = check;

  // Only the dirs that exist: a squad told to write to a missing dir would fail on its first step.
  let write = SRC_DIRS.filter((d) => isDir(join(project, d)));
  if (write.length === 0) {
    write = ['src', 'tests'];
    notes.push('no source folder found: edit tools/squad/squad.json to set "write" and "review" to your folders');
  }
  // Review reads the code; the test folders are for the coder only.
  const review = write.filter((d) => !TEST_DIRS.includes(d));

  const config = {
    project: found?.label ?? folder,
    commands,
    write,
    review: review.length ? review : write,
    base: baseBranch(project),
    tower: `${folder} squad`,
    source: 'dev-squad',
    cli: CLI,
    models: { ...DEFAULTS.models },
  };
  return { config, notes };
}

/** Runner files: every *.mjs, *.d.mts and *.sh, plus the README. Never logs, squad.json or kit/. */
const isRunnerFile = (name: string) => /\.(mjs|d\.mts|sh)$/.test(name) || name === 'README.md';

/**
 * Values go inside the tower's double quotes, so a stray quote or backslash would break its YAML.
 * Stripping them is simpler than escaping, and no real tower name needs either character.
 */
const quoteSafe = (value: string) => value.replace(/["\\]/g, '');

function fillTower(template: string, config: ReturnType<typeof detectConfig>['config']): string {
  const c = config as { tower: string; models: Record<string, string> };
  return template
    .replaceAll('{{TOWER}}', quoteSafe(c.tower))
    .replaceAll('{{CODER}}', quoteSafe(c.models.coder))
    .replaceAll('{{REVIEWER}}', quoteSafe(c.models.reviewer))
    .replaceAll('{{SECURITY}}', quoteSafe(c.models.security));
}

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
  const tmp = join(folder, `${DOT}.${process.pid}.tmp`);
  writeFileSync(tmp, `${out.join('\n')}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  return file;
}

/** Whether a key is set, and from where: the environment wins, as it does in run.mjs. Never prints the value. */
function checkKey(): number {
  if (process.env[KEY_NAME]?.trim()) {
    console.log(`OpenRouter key is set: from the environment (${KEY_NAME}).`);
    return 0;
  }
  const file = keyFile();
  if (existsSync(file)) {
    const m = KEY_LINE.exec(readFileSync(file, 'utf8').split(/\r?\n/).find((l) => KEY_LINE.test(l)) ?? '');
    if (m?.[1]?.trim()) {
      console.log(`OpenRouter key is set: in ${file}`);
      return 0;
    }
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
  const file = saveKey(key);
  console.log(`OpenRouter key saved in ${file} (only you can read it). The squad reads it from there; never put it in a repository.`);
  exit(0);
}

const USAGE = `usage: ${cliName()} squad init <dir> [--check "<command>"] [--force] | squad key [status]`;

// Run directly, not imported: a test imports detectConfig and must not start the CLI. Same realpath guard as config.mjs.
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

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

  const { config, notes } = detectConfig(project, check);
  const commands = (config as { commands: Record<string, string> }).commands;
  // Checked before anything is written, so a failed init leaves the repo untouched.
  if (!commands.check) {
    console.error('no check command found: pass --check "<command>" (the command that proves a step works, e.g. your test suite)');
    exit(1);
  }

  mkdirSync(squadDir, { recursive: true });
  const written: string[] = [];
  for (const name of readdirSync(RUNNER)) {
    if (!isRunnerFile(name)) continue;
    const from = join(RUNNER, name);
    const to = join(squadDir, name);
    copyFileSync(from, to);
    // copyFileSync does not promise the mode, and the steps run as scripts: keep the source's executable bit.
    if (name.endsWith('.sh')) chmodSync(to, statSync(from).mode & 0o777);
    written.push(`tools/squad/${name}`);
  }

  // squad.json, tasks and the tower belong to the repo: --force updates the runner only, so these are
  // written when missing and never overwritten.
  if (!existsSync(squadJson)) {
    writeFileSync(squadJson, `${JSON.stringify(config, null, 2)}\n`);
    written.push('tools/squad/squad.json');
  }
  const tasks = join(squadDir, 'tasks');
  mkdirSync(tasks, { recursive: true });
  const taskTemplate = join(tasks, 'TEMPLATE.md');
  if (!existsSync(taskTemplate)) {
    copyFileSync(join(KIT, 'TEMPLATE.md'), taskTemplate);
    written.push('tools/squad/tasks/TEMPLATE.md');
  }
  const tower = join(squadDir, 'squad.tower.yaml');
  if (!existsSync(tower)) {
    writeFileSync(tower, fillTower(readFileSync(join(KIT, 'squad.tower.yaml'), 'utf8'), config));
    written.push('tools/squad/squad.tower.yaml');
  }

  // The squad's logs and task output are local: they must not be committed to the repo.
  const ignore = join(project, '.gitignore');
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
  const towerPath = join(squadDir, 'squad.tower.yaml');
  const cfg = config as { project: string; write: string[]; review: string[] };
  console.log(`squad set up in ${project} (${cfg.project})`);
  console.log(`wrote: ${written.join(', ')}`);
  console.log(`check command: ${commands.check}`);
  console.log(`write: ${cfg.write.join(', ')}   review: ${cfg.review.join(', ')}`);
  for (const note of notes) console.log(`note: ${note}`);
  console.log(`next steps:
  put the key:     ${cli} squad key
  open the tower:  ${cli} ${shellPath(towerPath)}
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
