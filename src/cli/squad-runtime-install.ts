/**
 * Explicit preparation of the Dev Squad SDK runtime (#332): `npm ci` in the installed bundle folder
 * tools/squad/dev-squad/, from its lockfile, with install scripts off. Nothing calls this yet: init does not
 * install dependencies, so a squad set up without the runtime stays as it was. Errors are returned, never
 * thrown or exited, so the caller decides how to report them.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE_DIR } from './squad-tower.ts';

/** The git-ignore line for the runtime's node_modules. Generated, so init can add it without a hand-kept copy. */
export const RUNTIME_IGNORE_LINE = `tools/squad/${BUNDLE_DIR}/node_modules/`;

/** Runs a command with inherited stdio. Injected so the tests never start a real npm. */
export type Runner = (
  cmd: string,
  args: string[],
  opts: { stdio: 'inherit'; shell: boolean },
) => { status: number | null; error?: Error };

export interface RuntimeResult { ok: boolean; error?: string }

/** The default runner. On Windows npm is a .cmd shim, which only a shell can start. */
const defaultRun: Runner = (cmd, args, opts) => spawnSync(cmd, args, opts);

/**
 * Installs the runtime into `squadDir/dev-squad` with `npm ci --ignore-scripts`. The lockfile must already be
 * there (it ships with the bundle); a missing one is reported before npm runs. Output goes straight to the
 * terminal, so the user sees npm's own progress and errors.
 */
export function installRuntime(squadDir: string, run: Runner = defaultRun): RuntimeResult {
  const prefix = join(squadDir, BUNDLE_DIR);
  if (!existsSync(join(prefix, 'package-lock.json'))) {
    return { ok: false, error: `no package-lock.json in ${prefix}: run squad init first, so the bundle is installed` };
  }
  const res = run('npm', ['ci', '--prefix', prefix, '--ignore-scripts'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.error) return { ok: false, error: `could not start npm: ${res.error.message}` };
  if (res.status !== 0) return { ok: false, error: `npm ci failed in ${prefix} (exit ${res.status ?? 'unknown'})` };
  return { ok: true };
}
