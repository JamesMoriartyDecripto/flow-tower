import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, relative } from 'node:path';
import type { HookCallback, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

const run = promisify(execFile);
const LINTABLE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cts', '.mts']);
const FORMATTABLE = new Set([...LINTABLE, '.json', '.md', '.css', '.yaml', '.yml']);

/**
 * PostToolUse(Write|Edit|MultiEdit). Formats the touched file, auto-fixes what
 * ESLint can, and feeds the remaining problems back to the model as context so
 * it fixes them in the same turn instead of the reviewer finding them later.
 */
export const formatLint: HookCallback = async (input, _toolUseId, { signal }) => {
  const post = input as PostToolUseHookInput;
  const file = (post.tool_input as { file_path?: string }).file_path;
  if (!file || !FORMATTABLE.has(extname(file))) return {};

  const opts = { cwd: post.cwd, signal, timeout: 30_000 };
  // execFile with an argv array: the file path is never interpreted by a shell.
  await run('npx', ['--no-install', 'prettier', '--write', file], opts).catch(() => undefined);
  if (!LINTABLE.has(extname(file))) return {};

  try {
    await run('npx', ['--no-install', 'eslint', '--fix', '--max-warnings=0', '--format=unix', file], opts);
    return {};
  } catch (err) {
    const out = String((err as { stdout?: string }).stdout ?? '').trim();
    if (!out) return {}; // eslint missing or crashed: not the agent's problem
    const problems = out.split('\n').slice(0, 15).join('\n');
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse' as const,
        additionalContext: `Lint problems remain in ${relative(post.cwd, file)} after auto-fix. Fix them now:\n${problems}`,
      },
    };
  }
};
