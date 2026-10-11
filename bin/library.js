/**
 * The serve side of `flow-tower library` (#121b), in plain JS: the bin resolves the user's library before
 * Vite starts, and the entries have to be read (and warned about) in this same process — a spawned
 * src/cli/library.ts could only hand back text, not the environment the plugin reads. The
 * `library add|list|remove` subcommands stay in src/cli/library.ts.
 */
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { libraryPaths } from './config-file.js';

/** The empty-library refusal: it names the exact command that fixes it. */
export const EMPTY_LIBRARY = 'your library is empty: flow-tower library add <path to a .tower.yaml or a folder>';

/** realpath (case and symlinks resolved), or the resolved path when it does not exist: matches src/core/secrets.ts. */
const realOrSelf = (path) => { try { return realpathSync.native(path); } catch { return resolve(path); } };

/** True when `abs` is `root` itself or below it. */
const within = (root, abs) => {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * The entries of a library serve: every configured path that still exists, in order, plus the checkout's
 * examples when asked. `mine` keeps the user's own paths only, which the UI needs to tell them apart from
 * examples; a missing path is skipped with one warning instead of failing the whole serve.
 */
export function libraryEntries({ env, checkout, withExamples = false, warn = console.warn }) {
  const mine = [];
  for (const stored of libraryPaths({ env })) {
    const abs = resolve(stored);
    if (existsSync(abs)) mine.push(abs);
    else warn(`flow-tower: library entry is gone, skipping: ${abs} (remove it with "flow-tower library remove ${stored}")`);
  }
  return { mine, entries: withExamples ? [...mine, join(checkout, 'examples')] : [...mine] };
}

/**
 * One warning per entry that lives inside the flow-tower checkout but outside its examples: a tower of the
 * user's own, kept in this repo, is one `git add -A` away from a commit. `entries` is what the serve will
 * load, so a folder on the command line is covered just like a library path. Deduped by real path, because
 * two spellings of one entry are still one entry.
 */
export function warnInCheckout({ checkout, entries, warn = console.warn }) {
  const realCheckout = realOrSelf(checkout);
  const realExamples = join(realCheckout, 'examples');
  const seen = new Set();
  for (const entry of entries) {
    const abs = realOrSelf(entry);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!within(realCheckout, abs) || within(realExamples, abs)) continue;
    warn(`${entry} is inside the flow-tower checkout: it could end up in a commit; keep your towers in your own project and add them with flow-tower library add`);
  }
}
