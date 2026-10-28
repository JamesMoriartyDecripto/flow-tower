import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keys the OpenRouter loop holds. Kept for tests and docs; childEnv builds from an allowlist, so
// these never reach a child even if the list below changes.
export const SECRET_ENV = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'CONTEXT7_API_KEY', 'SEMGREP_APP_TOKEN'] as const;

// An allowlist, not a denylist: children run code the coder just wrote, and a denylist leaks every
// credential the host exports that nobody thought to name (AWS_*, NPM_TOKEN, GH_TOKEN, SSH_AUTH_SOCK,
// GOOGLE_APPLICATION_CREDENTIALS, KUBECONFIG, DOCKER_CONFIG...). Only what tools need to run is copied.
const ALLOWED_ENV = ['PATH', 'LANG', 'TERM', 'TZ', 'TMPDIR', 'TMP', 'TEMP', 'CI', 'NODE_ENV', 'NODE_OPTIONS', 'FORCE_COLOR', 'NO_COLOR'];

// One scratch HOME per worktree key. Two issues run at once in the same container, so a single shared
// HOME would let one issue's code plant ~/.npmrc for the other's children.
const scratchHomes = new Map<string, string>();

// Registered once, on the first scratchHome call. A long-running container would otherwise keep one
// temp folder per worktree forever, each holding whatever caches the children wrote.
let exitHookRegistered = false;

/** Removes every scratch HOME created so far and forgets them; the next scratchHome call makes new ones. */
export function removeScratchHomes(): void {
  for (const home of scratchHomes.values()) rmSync(home, { recursive: true, force: true });
  scratchHomes.clear();
}

/**
 * An empty folder that stands in for the user's home for the child processes of one worktree. Dropping
 * the secrets is not enough: the same code can read ~/.npmrc, ~/.gitconfig or cloud credentials under
 * the real HOME and print them into tool output. The XDG folders are created up front so tools that
 * assume they exist do not fail.
 */
export function scratchHome(key: string): string {
  if (!exitHookRegistered) {
    exitHookRegistered = true;
    process.once('exit', removeScratchHomes);
  }
  let home = scratchHomes.get(key);
  if (home === undefined) {
    home = mkdtempSync(join(tmpdir(), 'dev-squad-home-'));
    for (const dir of ['.config', '.cache', join('.local', 'share')]) mkdirSync(join(home, dir), { recursive: true });
    scratchHomes.set(key, home);
  }
  return home;
}

/** A copy of the allowlisted environment with HOME moved to `home`; the input is left untouched. */
export function childEnv(base: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV) if (base[key] !== undefined) env[key] = base[key];
  // LC_* carries locale settings (LC_ALL, LC_CTYPE...); it is the only prefix family that is safe to pass.
  for (const key of Object.keys(base)) if (key.startsWith('LC_') && base[key] !== undefined) env[key] = base[key];
  env.HOME = home;
  env.USERPROFILE = home;
  env.XDG_CONFIG_HOME = join(home, '.config');
  env.XDG_CACHE_HOME = join(home, '.cache');
  env.XDG_DATA_HOME = join(home, '.local', 'share');
  return env;
}
