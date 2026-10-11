/**
 * `flow-tower copy <example> [dest]` (#116): copies one of this checkout's examples into a new folder,
 * skipping node_modules, .git, git-ignored files and key files, then validates the copy through the
 * same `flow-tower validate` path. `--list` prints every example with the tower name from its YAML.
 * TypeScript, run with Node's type stripping like validate/token/config (see bin/flow-tower.js).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseDocument } from 'yaml';

const USAGE = 'usage: flow-tower copy <example> [dest] | --list';
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXAMPLES = join(pkgRoot, 'examples');
const CLI = join(pkgRoot, 'bin', 'flow-tower.js');

/** True when `path` is `root` itself or inside it. Prefix check, not a glob. */
const within = (root: string, path: string) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

/** Secrets that must never travel with a copy, even when git does not ignore them. */
const SECRET_NAME = /^\.env(\.|$)|\.(pem|key|p12|pfx)$|^id_(rsa|ed25519|ecdsa)$/;

interface Example {
  /** Path as the user types it: `dev-squad` or `starters/rag-bot`. */
  path: string;
  dir: string;
  /** The `name:` of the example's main tower YAML, so --list says what the folder holds. */
  name: string;
}

/** Reads a tower YAML's `name:`; undefined when it is unreadable or has none. */
function towerName(file: string): string | undefined {
  try {
    const name = parseDocument(readFileSync(file, 'utf8')).toJS()?.name;
    return typeof name === 'string' && name.trim() ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every example: one folder per child of examples/, plus one per folder under examples/starters/.
 * A folder without a *.tower.yaml of its own is not an example (examples/README.md, nested towers/).
 */
function examples(): Example[] {
  const out: Example[] = [];
  const add = (dir: string, path: string) => {
    const main = readdirSync(dir).filter((f) => f.endsWith('.tower.yaml')).sort()[0];
    if (main) out.push({ path, dir, name: towerName(join(dir, main)) ?? path });
  };
  for (const e of readdirSync(EXAMPLES, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const dir = join(EXAMPLES, e.name);
    // starters/ is a shelf, not an example: its children are the examples.
    if (e.name === 'starters') for (const s of readdirSync(dir, { withFileTypes: true })) {
      if (s.isDirectory() && !s.name.startsWith('.')) add(join(dir, s.name), `starters/${s.name}`);
    } else add(dir, e.name);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Files under `dir`, relative paths, without node_modules and .git (regenerated, not content). */
function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

/**
 * The files git ignores, asked once for the whole batch (`git check-ignore --stdin -z`): the checkout's
 * rules, the .gitignore negations for example logs included. No git or no repo: nothing is ignored.
 */
function ignoredFiles(files: string[]): Set<string> {
  if (!files.length) return new Set();
  const r = spawnSync('git', ['-C', pkgRoot, 'check-ignore', '--stdin', '-z'], {
    input: files.map((f) => relative(pkgRoot, f)).join('\0') + '\0', encoding: 'utf8',
  });
  if (r.error || (r.status !== 0 && r.status !== 1)) return new Set(); // 1 = none ignored; other = no git
  return new Set((r.stdout ?? '').split('\0').filter(Boolean).map((p) => resolve(pkgRoot, p)));
}

/** The main tower YAML of a copied example: the *.tower.yaml directly in its folder. */
function mainTower(dir: string): string | undefined {
  const main = readdirSync(dir).filter((f) => f.endsWith('.tower.yaml')).sort()[0];
  return main ? join(dir, main) : undefined;
}

const { values, positionals } = parseArgs({ strict: false, allowPositionals: true, options: { list: { type: 'boolean', default: false } } });

if (values.list) {
  for (const e of examples()) console.log(`${e.path} — ${e.name}`);
  exit(0);
}

const [example, destArg] = positionals;
if (!example) {
  console.error(USAGE);
  exit(2);
}
const src = resolve(EXAMPLES, example);
if (!within(EXAMPLES, src) || !existsSync(src) || !statSync(src).isDirectory()) {
  console.error(`unknown example "${example}". flow-tower copy --list names every example.`);
  exit(1);
}
const dest = resolve(destArg ?? basename(example));
// Writing back into examples/ would make the checkout look like a starter pack of its own copies.
if (within(EXAMPLES, dest)) {
  console.error(`refusing to copy into ${dest}: that is inside ${EXAMPLES}. Pick a folder outside the checkout.`);
  exit(1);
}
if (existsSync(dest) && readdirSync(dest).length) {
  console.error(`refusing to copy into ${dest}: the folder exists and is not empty.\nUse a new folder, or remove its contents first.`);
  exit(1);
}

const ignored = ignoredFiles(listFiles(src).map((rel) => join(src, rel)));
let copied = 0;
for (const rel of listFiles(src)) {
  const from = join(src, rel);
  if (ignored.has(from) || SECRET_NAME.test(basename(rel))) continue;
  const to = join(dest, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
}

const main = mainTower(src);
// A dogfood tower points at this repo with root: ../..: those paths break the moment it is copied.
const dogfood = main ? /^root:\s*\.\.\/\.\.\s*$/m.test(readFileSync(main, 'utf8')) : false;
// `npm run simulate` matches its argument against project ids, which are tower file paths: the display
// name would silently fall back to the first tower, so hand it the file name without the extension.
const project = main ? basename(main, '.tower.yaml') : undefined;

// The same validation as `flow-tower validate <dest> --json`: run the CLI, do not re-implement it.
const r = spawnSync(process.execPath, [CLI, 'validate', dest, '--json'], { encoding: 'utf8' });
let validation: { towers?: { name?: string; issues?: { level: string; message: string }[] }[] } | undefined;
try { validation = JSON.parse(r.stdout); } catch { validation = undefined; }

console.log(`copied examples/${example} -> ${dest} (${copied} files)`);
if (dogfood) console.log(`warning: this example sets root: ../.., so its paths point at the flow-tower checkout, not at your copy.\n         Fix root: and every files:/prompt path before opening it.`);
if (validation?.towers) {
  const issues = validation.towers.flatMap((t) => t.issues ?? []);
  const count = (level: string) => issues.filter((i) => i.level === level).length;
  console.log(`validation: ${validation.towers.length} tower(s), ${count('error')} error(s), ${count('warning')} warning(s)`);
  for (const i of issues.filter((x) => x.level !== 'info')) console.log(`  ${i.level}: ${i.message}`);
} else {
  console.log(`validation: could not run (flow-tower validate ${dest} --json failed)`);
}
console.log(`next steps
  open it:     flow-tower ${dest}
  try it live: npm run simulate -- ${project ?? '<tower file>'} --url http://127.0.0.1:5317   (from ${pkgRoot})
  adapt root: and files: to where the files live in your copy`);
exit(0);
