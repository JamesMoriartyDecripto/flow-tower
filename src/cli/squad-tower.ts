/**
 * The dev squad's tower for `flow-tower squad init` (#330): the canonical examples/dev-squad tower, installed
 * as tools/squad/squad.tower.yaml (renamed and re-rooted for this project), with the support files it points
 * at under tools/squad/dev-squad/. Only a fixed allowlist is copied. The secret check the loader uses filters
 * known secret paths; the source is the trusted public canonical distribution, not arbitrary user assets.
 * This is not a content scan: a secret placed inside an allowed file is not detected.
 */
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isMap, parseDocument } from 'yaml';
import { isSecretPath } from '../core/secrets.ts';

/** Where the bundle's support files land, under the squad folder. The tower's `root:` points here. */
export const BUNDLE_DIR = 'dev-squad';
/** The one main tower a squad has. The canonical main tower is never copied into BUNDLE_DIR. */
export const MAIN_TOWER = 'squad.tower.yaml';
const CANONICAL_MAIN = 'dev-squad.tower.yaml';
/** The folders the canonical tower and its agents reference. Anything else in the example is not part of the squad. */
const BUNDLE_DIRS = ['.claude', 'deploy', 'logs', 'memory', 'prompts', 'scripts', 'src', 'towers'];
/** Top-level files of the bundle. The main tower is not listed: it is installed once, as MAIN_TOWER. */
// package.json and its lockfile pin the SDK runtime; they are copied so `npm ci` can rebuild it from the bundle.
const BUNDLE_FILES = ['.mcp.json', 'CLAUDE.md', 'README.md', 'package.json', 'package-lock.json'];
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** Whether a path exists at all, a dangling symlink included (existsSync follows links and would miss it). */
const present = (path: string) => { try { lstatSync(path); return true; } catch { return false; } };

/** A real folder, not a symlink to one: the walk never follows links, so a link cannot pull in outside files. */
const isRealDir = (path: string) => { try { return lstatSync(path).isDirectory(); } catch { return false; } };

/** A real regular file, not a link. */
const isRealFile = (path: string) => { try { return lstatSync(path).isFile(); } catch { return false; } };

/**
 * Throws when `path` exists but is not a real folder. A symlink here would send the writes to wherever it
 * points, possibly outside the repo, so the install stops before it writes anything.
 */
export function assertRealDirOrMissing(path: string): void {
  if (present(path) && !isRealDir(path)) {
    throw new Error(`refusing to write through ${path}: it is not a real folder (a symlink or file is in the way)`);
  }
}

/**
 * Throws when `path` exists but is not a regular file. Checked with lstat, so a dangling symlink is refused too:
 * a write through it would create the file at the link's target, outside the repo.
 */
export function assertRegularOrMissing(path: string): void {
  if (present(path) && !isRealFile(path)) {
    throw new Error(`refusing to write ${path}: it is not a regular file (a symlink or folder is in the way)`);
  }
}

/**
 * Checks the parent (tools/), the squad folder and the bundle root before any write. A link at any of them
 * would send writes outside the repo, and mkdir follows links, so the check must use lstat on each level.
 * The init command calls this too, before the runner files are copied.
 */
export function assertSquadDir(squadDir: string): void {
  assertRealDirOrMissing(dirname(squadDir));
  assertRealDirOrMissing(squadDir);
  assertRealDirOrMissing(join(squadDir, BUNDLE_DIR));
}

/**
 * Regular files under `root/rel`, as paths relative to `root`. Symlinks (Dirent reports them as links, not
 * as files or folders) are skipped. Folders are checked against the secret check before recursing, so a
 * folder such as src/.ssh is never read; node_modules and .git are skipped too.
 */
function walk(root: string, rel: string, out: string[]): void {
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
    const path = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (!isSecretPath(path)) walk(root, path, out);
    } else if (e.isFile() && !isSecretPath(path)) out.push(path);
  }
}

/** The bundle's files under `source`, relative to it: the allowlisted folders plus the top-level files. */
function bundleFiles(source: string): string[] {
  const out: string[] = [];
  for (const dir of BUNDLE_DIRS) if (isRealDir(join(source, dir))) walk(source, dir, out);
  for (const file of BUNDLE_FILES) {
    if (isRealFile(join(source, file)) && !isSecretPath(file)) out.push(file);
  }
  return out;
}

/**
 * Every folder the bundle writes need, under the bundle root, must be a real folder or missing. Checked for
 * all files before the first write, so a symlink anywhere in the destination stops the whole install.
 */
function assertBundleDirs(squadDir: string, rels: string[]): void {
  const bundle = join(squadDir, BUNDLE_DIR);
  const dirs = new Set<string>();
  for (const rel of rels) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const dir of dirs) assertRealDirOrMissing(join(bundle, dir));
}

/**
 * Reads the canonical main tower from `source`. It must be a real regular file (a link would read from wherever
 * it points). Errors never echo the file's content: a parser message can quote the text it failed on.
 */
function readCanonicalMain(source: string): string {
  const path = join(source, CANONICAL_MAIN);
  if (!isRealFile(path)) throw new Error(`refusing to read ${path}: the canonical tower is missing or not a regular file`);
  return readFileSync(path, 'utf8');
}

/**
 * The main tower with this project's name and root. It is edited as a YAML document, never by string
 * replacement, so a name with quotes or colons still yields a valid file and the comments are kept.
 * Throws when the source is not a YAML mapping, so a broken canonical tower never reaches a write.
 */
function mainTower(source: string, towerName: string): string {
  const doc = parseDocument(source);
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    throw new Error(`the canonical tower ${CANONICAL_MAIN} is not a valid YAML mapping: fix the distribution`);
  }
  doc.set('name', towerName);
  doc.set('root', BUNDLE_DIR);
  return doc.toString();
}

/**
 * Checks every destination the tower install may write, before any write: the squad folder and bundle folders
 * must be real folders, and the main tower and each bundle file must be a regular file or missing. The canonical
 * main tower source is also read and parsed here, so a missing, linked or malformed source stops the install
 * before any write. Returns the bundle's file list so the caller does not walk the source twice.
 */
export function assertTowerDests(source: string, squadDir: string): string[] {
  mainTower(readCanonicalMain(source), 'check');
  const bundle = bundleFiles(source);
  assertSquadDir(squadDir);
  assertBundleDirs(squadDir, bundle);
  assertRegularOrMissing(join(squadDir, MAIN_TOWER));
  for (const rel of bundle) assertRegularOrMissing(join(squadDir, BUNDLE_DIR, rel));
  return bundle;
}

/**
 * Installs the bundle into `squadDir` from `source` (the canonical example folder). Existing files are never
 * overwritten, not even on --force: a missing file is filled, a file the repo already has is the repo's own
 * edit. A destination folder or file that is a link is refused (the install throws before writing anything).
 * Modes are kept, so the scripts stay executable. Returns what was written, for the init report.
 */
export function installTower(source: string, squadDir: string, towerName: string): { main: boolean; files: number } {
  const bundle = assertTowerDests(source, squadDir);

  const mainPath = join(squadDir, MAIN_TOWER);
  let main = false;
  if (!present(mainPath)) {
    mkdirSync(squadDir, { recursive: true });
    writeFileSync(mainPath, mainTower(readCanonicalMain(source), towerName));
    main = true;
  }

  let files = 0;
  for (const rel of bundle) {
    const from = join(source, rel);
    const to = join(squadDir, BUNDLE_DIR, rel);
    // Already checked by assertTowerDests: here it is a regular file the repo owns, which is kept as it is.
    if (present(to)) continue;
    mkdirSync(join(to, '..'), { recursive: true });
    copyFileSync(from, to);
    // copyFileSync does not promise the mode, and the squad's scripts must stay runnable: copy the source's bits.
    chmodSync(to, statSync(from).mode & 0o777);
    files++;
  }
  return { main, files };
}
