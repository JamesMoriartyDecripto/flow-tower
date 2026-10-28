import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keys the OpenRouter loop holds. Child processes run code the coder just wrote (vitest, check,
// prettier configs next to a file), so none of them may inherit these.
export const SECRET_ENV = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'CONTEXT7_API_KEY', 'SEMGREP_APP_TOKEN'] as const;

let scratch: string | undefined;

/**
 * An empty folder that stands in for the user's home for every child process. Dropping the secrets
 * is not enough: the same code can read ~/.npmrc, ~/.gitconfig or cloud credentials under the real
 * HOME and print them into tool output. One folder per process; npm and friends create their
 * caches inside it on demand.
 */
export function scratchHome(): string {
  scratch ??= mkdtempSync(join(tmpdir(), 'dev-squad-home-'));
  return scratch;
}

/** A copy of the environment without the secrets and with HOME moved to the scratch folder; the input is left untouched. */
export function childEnv(base: NodeJS.ProcessEnv = process.env, home: string = scratchHome()): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of SECRET_ENV) delete env[key];
  env.HOME = home;
  env.USERPROFILE = home;
  env.XDG_CONFIG_HOME = join(home, '.config');
  env.XDG_CACHE_HOME = join(home, '.cache');
  env.XDG_DATA_HOME = join(home, '.local', 'share');
  return env;
}
