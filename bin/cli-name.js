/**
 * The command name to print in a hint (#193). `npm link` is not in the README, so most users have no
 * `flow-tower` on PATH: a bare `flow-tower …` hint then fails when pasted. Plain JS so bin/ and the
 * TypeScript CLI (src/cli) can both load it without a second Node.
 */
import { accessSync, constants, realpathSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The hint for the OTHER machine (the server's Admin tab and `token add`): that machine's checkout is
 * unknown here, so the hint names the placeholder rather than this checkout's path.
 */
export const OTHER_MACHINE_SUFFIX = ' (or node <their checkout>/bin/flow-tower.js)';
export const OTHER_MACHINE_CLI = `flow-tower${OTHER_MACHINE_SUFFIX}`;

/** A path as one shell word: quoted when it has a space, so the hint can be pasted as it is. */
export function shellPath(path) {
  return /\s/.test(path) ? `"${path}"` : path;
}

/**
 * True when an executable `flow-tower` on PATH resolves to this checkout's CLI. `npm link` makes that
 * entry a symlink, so both sides go through realpath before they are compared.
 */
function onPathHere(env, cli) {
  let target;
  try { target = realpathSync(cli); } catch { return false; }
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, 'flow-tower');
    // The entry must exist; its target only needs to be this checkout's CLI, which runs through node, so
    // the target's own execute bit does not decide anything here.
    try {
      accessSync(candidate, constants.F_OK);
      if (realpathSync(candidate) === target) return true;
    } catch { /* not there, or a dangling link: keep looking */ }
  }
  return false;
}

/** `flow-tower` when it works from PATH, else the `node` form that always runs this checkout's CLI. */
export function cliName({ env = process.env, checkout = CHECKOUT } = {}) {
  const cli = join(checkout, 'bin', 'flow-tower.js');
  return onPathHere(env, cli) ? 'flow-tower' : `node ${shellPath(cli)}`;
}
