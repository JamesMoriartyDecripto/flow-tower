import type { HookCallback, HookEvent, HookCallbackMatcher, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { bashGuard } from './bash-guard';
import { changelogGate } from './changelog-gate';
import { contextLoader } from './context-loader';
import { formatLint } from './format-lint';
import { secretScanPrompt, secretScanWrite } from './secret-scan';

/** Edits must stay inside the issue worktree, whatever path the model invents. */
function worktreeFence(worktree: string): HookCallback {
  return async (input) => {
    const path = String(((input as PreToolUseHookInput).tool_input as { file_path?: string }).file_path ?? '');
    if (!path || path.startsWith(`${worktree}/`)) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason: `Writes are limited to ${worktree}.`,
      },
    };
  };
}

/** Async audit trail: never blocks the agent, never influences a decision. */
const audit: HookCallback = async (input, toolUseId) => {
  const { tool_name, agent_type } = input as PreToolUseHookInput;
  queueMicrotask(() => console.log(`[audit] ${agent_type ?? 'lead'} ${tool_name} ${toolUseId ?? ''}`));
  return { async: true };
};

/**
 * Every lifecycle hook Dev Squad registers, in one place. All matching hooks run
 * in parallel and the most restrictive decision wins (deny > defer > ask > allow).
 */
export function buildHooks(ctx: { worktree: string; issue: number; areas?: string[] }): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SessionStart: [{ hooks: [contextLoader(ctx)] }],
    UserPromptSubmit: [{ hooks: [secretScanPrompt] }],
    PreToolUse: [
      { matcher: 'Bash', hooks: [bashGuard] },
      { matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [worktreeFence(ctx.worktree), secretScanWrite] },
      { hooks: [audit] },
    ],
    PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [formatLint], timeout: 60 }],
    Stop: [{ hooks: [changelogGate(ctx)] }],
  };
}
