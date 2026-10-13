/**
 * `flow-tower library add|list|remove` (#121): the user's own towers live in the user's own projects.
 * The list is a few paths in the user folder's config.json (`library`, src/server/config.ts), never
 * anything inside the flow-tower checkout and never mixed into examples/. Like `token` and `connect`,
 * bin/flow-tower.js runs this file with Node's built-in type stripping; `checkPath` is exported for
 * tests, so the CLI runs only when this file is the entry point.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { realOrSelf, userHome, within } from '../core/secrets.ts';
import { readUserConfig, writeUserConfig } from '../server/user-config.ts';

/** The checkout this CLI runs from: the `examples/` refusal and the "could be committed" warning compare against it. */
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE = 'usage: flow-tower library add <path>... | list | remove <path>';

/** How deep a folder is searched for a tower: the folder itself is level 0, its own files level 1. */
const SCAN_DEPTH = 3;

/** Case-insensitive, like the loader's own scan: a file saved as `X.TOWER.YAML` is still a tower. */
const TOWER_FILE = /\.tower\.yaml$/i;

export interface CheckOptions {
  /** The flow-tower checkout: a path under its examples/ must be copied out, the rest may be committed by mistake. */
  checkout: string;
  /** The user folder: the loader never reads a tower there, so a library entry would be dead weight. */
  home: string;
}

export type CheckResult = { ok: true; warning?: string } | { ok: false; reason: string };

/**
 * True when `dir` or a folder up to `levels` below it holds a *.tower.yaml. node_modules and .git are
 * skipped: their contents are dependencies and history, never the user's towers.
 */
function hasTower(dir: string, levels: number): boolean {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; } // unreadable: nothing to offer
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    if (e.isFile() && TOWER_FILE.test(e.name)) return true;
    if (e.isDirectory() && levels > 0 && hasTower(join(dir, e.name), levels - 1)) return true;
  }
  return false;
}

/**
 * Is this a tower the user may keep in their library? Every refusal names what to do instead. The
 * comparison uses real paths (symlinks resolved, like src/core/secrets.ts), so a symlink cannot smuggle
 * an example or the user folder past the check. A tower inside the checkout but outside examples/ is
 * allowed with a warning: the flow-tower repo could commit it.
 */
export function checkPath(abs: string, { checkout, home }: CheckOptions): CheckResult {
  const real = realOrSelf(abs);
  const realCheckout = realOrSelf(checkout);
  const realHome = realOrSelf(home);
  if (!existsSync(real)) return { ok: false, reason: `${abs} does not exist: check the path, or create it first` };
  if (within(realHome, real)) return { ok: false, reason: `${abs} is inside the user folder (${realHome}), which the loader never reads: keep your towers in your own project` };
  const examples = join(realCheckout, 'examples');
  if (within(examples, real)) return { ok: false, reason: `${abs} is under the flow-tower examples: copy it out with "flow-tower copy"` };

  const stat = statSync(real);
  if (stat.isFile()) {
    if (!TOWER_FILE.test(real)) return { ok: false, reason: `${abs} is not a *.tower.yaml file: point at the tower file or at a folder that holds one` };
  } else if (stat.isDirectory()) {
    if (!hasTower(real, SCAN_DEPTH)) return { ok: false, reason: `${abs} holds no *.tower.yaml in its first ${SCAN_DEPTH} levels: point at the tower file or at a folder that holds one` };
  } else {
    return { ok: false, reason: `${abs} is neither a file nor a folder: point at a *.tower.yaml file or at a folder that holds one` };
  }

  if (within(realCheckout, real)) return { ok: true, warning: `${abs} is inside the flow-tower checkout: it could be committed to the flow-tower repo — keep your own towers in your own project` };
  return { ok: true };
}

/** The `library` key as stored: an absent or hand-broken value reads as an empty list. */
function storedLibrary(config: Record<string, unknown>): string[] {
  const value = config.library;
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : [];
}

/** The same tower, however it is spelled: one real path, so a symlinked duplicate cannot be added twice. */
const same = (a: string, b: string) => a === b || realOrSelf(a) === realOrSelf(b);

/**
 * True when one of the two paths holds the other: a listed folder that holds the new tower, or a new folder
 * that holds a listed tower. Either way the loader would read the same tower twice. Real paths, as `same`.
 */
const coversSameTower = (listed: string, abs: string) => {
  const a = realOrSelf(listed);
  const b = realOrSelf(abs);
  return within(a, b) || within(b, a);
};

/**
 * Adds one tower to the library in the user folder's config. Shared by `library add` and `share` (#164), so
 * both refuse and deduplicate the same way. The config is re-read right before the write: another command
 * may have written meanwhile, and the write must build on what is on disk now.
 */
export function addToLibrary(home: string, abs: string): { added: boolean; reason?: string; warning?: string; via?: string } {
  const check = checkPath(abs, { checkout: PKG_ROOT, home });
  if (!check.ok) return { added: false, reason: check.reason };
  const library = storedLibrary(readUserConfig(home));
  // Write only when the list grew: an add that changed nothing must not rewrite the user's file.
  if (library.some((p) => same(p, abs))) return { added: false };
  // A tower already reached through a listed folder, or a folder already holding a listed tower, would be
  // loaded twice: refuse it and name the entry that already covers it.
  const covered = library.find((p) => coversSameTower(p, abs));
  // Not a refusal: the tower is already there, so the caller says so and carries on (exit 0).
  if (covered !== undefined) return { added: false, via: covered };
  writeUserConfig(home, { library: [...library, abs] });
  return { added: true, warning: check.warning };
}

/** The three commands. Returns the exit code instead of calling exit, so a caller can decide. */
export function run(args: string[]): number {
  const [cmd, ...rest] = args;
  const home = userHome();
  const config = readUserConfig(home);
  const library = storedLibrary(config);

  switch (cmd) {
    case 'add': {
      if (!rest.length) { console.error(USAGE); return 1; }
      let refused = false;
      for (const arg of rest) {
        const abs = resolve(arg);
        const r = addToLibrary(home, abs);
        if (r.reason !== undefined) { console.log(`refused: ${r.reason}`); refused = true; continue; }
        if (!r.added) { console.log(`already in: ${abs}${r.via ? ` (via ${r.via})` : ''}`); continue; }
        console.log(`added: ${abs}`);
        if (r.warning) console.log(`  warning: ${r.warning}`);
      }
      return refused ? 1 : 0;
    }
    case 'list': {
      if (!library.length) { console.log('no towers yet: add one with "flow-tower library add <path>"'); return 0; }
      for (const p of library) console.log(existsSync(p) ? p : `${p}  missing`);
      return 0;
    }
    case 'remove': {
      const arg = rest[0];
      if (!arg || rest.length > 1) { console.error(USAGE); return 1; }
      const next = library.filter((p) => !same(p, resolve(arg)));
      if (next.length === library.length) { console.error(`not in the library: ${arg}`); return 1; }
      writeUserConfig(home, { library: next });
      console.log(`removed: ${arg}`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 1;
  }
}

// Only run as a command: importing this file (tests) must not touch the user's config.
const entry = argv[1];
if (entry !== undefined && realOrSelf(entry) === realOrSelf(fileURLToPath(import.meta.url))) exit(run(argv.slice(2)));
