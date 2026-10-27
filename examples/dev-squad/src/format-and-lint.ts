import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { childEnv } from './child-env';

// Kept out of hooks/format-lint.ts, which imports the Agent SDK types: the repo's tests import this module
// without the SDK installed, and the OpenRouter loop shares it without depending on the hook file.
const execFileAsync = promisify(execFile);
const LINTABLE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cts', '.mts']);
export const FORMATTABLE = new Set([...LINTABLE, '.json', '.md', '.css', '.yaml', '.yml']);
const MAX_PROBLEM_LINES = 15;

export type Run = (
  cmd: string,
  args: string[],
  opts: { cwd: string; signal?: AbortSignal; timeout: number; env?: NodeJS.ProcessEnv },
) => Promise<unknown>;

/**
 * Formats and lints one file with the project's own config. Returns the problems
 * ESLint still reports after --fix, or '' when there are none or the check could
 * not run. Usable outside the hook (the OpenRouter loop has no PostToolUse).
 */
export async function formatAndLint(
  cwd: string,
  file: string,
  signal?: AbortSignal,
  run: Run = execFileAsync,
): Promise<string> {
  // Prettier loads a config found next to the file, so the child must not see the secrets.
  const opts = { cwd, signal, timeout: 30_000, env: childEnv() };
  // Absolute path so a value like `--config=src/x.js` is never read as an option
  // by prettier or eslint. The check must not depend on the caller passing one.
  const path = resolve(cwd, file);
  // Containment is enforced here, not only by the caller's fence: an absolute or `../` file
  // would otherwise have prettier --write and eslint --fix rewrite files outside the project.
  const rel = relative(cwd, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return '';
  // execFile with an argv array: the file path is never interpreted by a shell.
  if (FORMATTABLE.has(extname(file))) {
    await run('npx', ['--no-install', 'prettier', '--write', path], opts).catch(() => undefined);
  }
  if (!LINTABLE.has(extname(file))) return '';

  try {
    // No --rule or --format overrides: the project config is the source of truth,
    // and ESLint 9 dropped the `unix` formatter that used to be requested here.
    await run('npx', ['--no-install', 'eslint', '--fix', '--max-warnings=0', path], opts);
    return '';
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string };
    // Exit 1 means lint problems; anything else (2 = config error or crash, or
    // eslint missing) is not something the agent can fix.
    if (e.code !== 1) return '';
    return String(e.stdout ?? '').trim().split('\n').slice(0, MAX_PROBLEM_LINES).join('\n').trim();
  }
}
