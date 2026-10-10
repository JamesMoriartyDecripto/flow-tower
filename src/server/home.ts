import { userHome, within } from '../core/secrets.ts';

/**
 * The user's own folder (#68): key, voice journal and memory, outside every repo (src/core/secrets.ts).
 * Warns at startup when FLOW_TOWER_HOME points inside the flow-tower folder: a personal journal next to
 * the code is one `git add -A` away from a commit.
 */
export { userHome };

export function warnIfInRepo(pkgRoot: string) {
  const home = userHome();
  if (within(pkgRoot, home)) console.warn(`flow-tower: FLOW_TOWER_HOME (${home}) is inside the flow-tower folder: keep your key and voice journal outside any repository.`);
}
