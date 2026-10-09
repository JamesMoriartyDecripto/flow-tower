import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/** PreToolUse deny with a reason the model sees and can act on. */
export const deny = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse' as const,
    permissionDecision: 'deny' as const,
    permissionDecisionReason: reason,
  },
});

/** The fields every write guard reads, for Write, Edit and MultiEdit alike. */
export const toolInput = (input: unknown) =>
  (input as PreToolUseHookInput).tool_input as { file_path?: string; content?: string; new_string?: string };
