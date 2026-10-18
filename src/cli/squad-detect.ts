/**
 * What a squad needs to know about a git project, read from its files (#265): the check command, the folders a
 * coder may write and review, and the branch the diffs run against. Split from squad.ts to keep that file short.
 * TypeScript, run with Node's type stripping like squad.ts (see bin/commands.js).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// config.mjs ships no .d.mts, so a static import fails the typecheck. A dynamic import with its shape
// written here keeps the model names in one place: the runner's DEFAULTS, never a copy.
const configUrl = pathToFileURL(join(pkgRoot, 'tools', 'squad', 'config.mjs')).href;
const { DEFAULTS } = (await import(configUrl)) as { DEFAULTS: { models: Record<string, string> } };

/** Source folders a squad may write to, in the order the config lists them. */
// scripts and bin hold the code of many Node and Python projects; tools is left out on purpose: it is the runner's folder.
const SRC_DIRS = ['src', 'lib', 'app', 'pkg', 'cmd', 'scripts', 'bin', 'internal', 'tests', 'test', '__tests__', 'spec'];
/** The subset that holds tests: the review reads the code, not the tests. */
const TEST_DIRS = ['tests', 'test', '__tests__', 'spec'];
/** What `npm init` writes into scripts.test: a placeholder, not a test suite. */
const NPM_PLACEHOLDER = 'no test specified';

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
 * The branch the squad diffs against: origin's default branch when there is one (origin/main); else a local
 * `main`, then `master`; else the current branch. A feature branch is never the answer by default: a squad
 * set up on it would diff the branch against itself and every diff would come out empty (#265).
 * `main` only when git cannot name any of these.
 */
function baseBranch(project: string): string {
  const git = (args: string[]) => spawnSync('git', ['-C', project, ...args], { encoding: 'utf8' });
  const symbolic = (ref: string) => {
    const r = git(['symbolic-ref', '--short', ref]);
    return r.status === 0 ? r.stdout.trim() : '';
  };
  const hasLocal = (name: string) => git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]).status === 0;
  return symbolic('refs/remotes/origin/HEAD') || ['main', 'master'].find(hasLocal) || symbolic('HEAD') || 'main';
}

/**
 * The squad config for a project, from what its files say. `check` overrides the detected check command, so
 * `--check` always wins. No check at all leaves commands.check unset: the caller turns that into an error.
 * The checkout's path is not here: it is machine-local and init writes it to tools/squad/.cli (#265).
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
    models: { ...DEFAULTS.models },
  };
  return { config, notes };
}
