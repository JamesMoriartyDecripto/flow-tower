import { extname, relative } from 'node:path';
import type { HookCallback, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { FORMATTABLE, formatAndLint } from '../format-and-lint';

/**
 * PostToolUse(Write|Edit|MultiEdit). Formats the touched file, auto-fixes what
 * ESLint can, and feeds the remaining problems back to the model as context so
 * it fixes them in the same turn instead of the reviewer finding them later.
 */
export const formatLint: HookCallback = async (input, _toolUseId, { signal }) => {
  const post = input as PostToolUseHookInput;
  const file = (post.tool_input as { file_path?: string }).file_path;
  if (!file || !FORMATTABLE.has(extname(file))) return {};

  const problems = await formatAndLint(post.cwd, file, signal);
  if (!problems) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse' as const,
      additionalContext: `Lint problems remain in ${relative(post.cwd, file)} after auto-fix. Fix them now:\n${problems}`,
    },
  };
};
