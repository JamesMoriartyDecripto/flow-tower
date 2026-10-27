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
    console.log(`[hook] PreToolUse fence deny ${path} (outside ${worktree})`);
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
const audit = (role = 'lead'): HookCallback => async (input, toolUseId) => {
  const { tool_name, agent_type } = input as PreToolUseHookInput;
  queueMicrotask(() => console.log(`[audit] ${agent_type ?? role} ${tool_name} ${toolUseId ?? ''}`));
  return { async: true };
};

/**
 * Every lifecycle hook Dev Squad registers, in one place. All matching hooks run
 * in parallel and the most restrictive decision wins (deny > defer > ask > allow).
 * `role` names the agent of a runAgent() session: it runs as the main thread, so hook inputs carry no agent_type.
 */
export function buildHooks(ctx: { worktree: string; issue: number; areas?: string[]; role?: string }): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SessionStart: [{ hooks: [contextLoader(ctx)] }],
    UserPromptSubmit: [{ hooks: [secretScanPrompt] }],
    PreToolUse: [
      { matcher: 'Bash', hooks: [bashGuard(ctx.role)] },
      { matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [worktreeFence(ctx.worktree), secretScanWrite] },
      { hooks: [audit(ctx.role)] },
    ],
    PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [formatLint], timeout: 60 }],
    Stop: [{ hooks: [changelogGate(ctx)] }],
  };
}
