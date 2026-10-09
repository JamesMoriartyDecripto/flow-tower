import type { HookCallback, HookCallbackMatcher, HookEvent, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { assetBudget } from './asset-budget';
import { buildGate } from './build-gate';
import { contextLoader } from './context-loader';
import { costLedger } from './cost-ledger';
import { licenseCheck } from './license-check';
import { secretScanPrompt, secretScanWrite } from './secret-scan';

export interface HookContext { department: string; runId: string; cwd: string }

/** Writes stay inside the run workspace (game project + department scratch). */
function workspaceFence(cwd: string): HookCallback {
  return async (input) => {
    const path = String(((input as PreToolUseHookInput).tool_input as { file_path?: string }).file_path ?? '');
    if (!path || path.startsWith(`${cwd}/`)) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason: `Writes are limited to the studio workspace ${cwd}.`,
      },
    };
  };
}

/** Async audit trail per department: never blocks, never decides. */
function audit(ctx: HookContext): HookCallback {
  return async (input, toolUseId) => {
    const { tool_name, agent_type } = input as PreToolUseHookInput;
    queueMicrotask(() => console.log(`[audit:${ctx.runId}] ${ctx.department}/${agent_type ?? 'main'} ${tool_name} ${toolUseId ?? ''}`));
    return { async: true };
  };
}

/** Screenshots and scene dumps are huge: keep only a pointer in context. */
const trimHeavyOutput: HookCallback = async (input) => {
  const { tool_name } = input as { tool_name: string };
  if (!/screenshot|get_scene_info/.test(tool_name)) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse' as const,
      additionalContext: 'Large tool output: describe what you saw in <= 5 bullets, do not re-request it unless the scene changed.',
    },
  };
};

/**
 * Every lifecycle hook Forge Studio registers. Matching hooks run in parallel
 * and the most restrictive decision wins (deny > ask > allow).
 */
export function buildHooks(ctx: HookContext): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SessionStart: [{ hooks: [contextLoader(ctx)] }],
    UserPromptSubmit: [{ hooks: [secretScanPrompt] }],
    PreToolUse: [
      { matcher: 'mcp__blender__execute_blender_code|mcp__forge__register_asset', hooks: [assetBudget] },
      { matcher: 'WebFetch|mcp__forge__register_asset|mcp__imagegen__generate_image', hooks: [licenseCheck] },
      { matcher: 'Write|Edit|MultiEdit', hooks: [workspaceFence(ctx.cwd), secretScanWrite] },
      { matcher: 'mcp__forge__package_build|Bash', hooks: [buildGate(ctx)] },
      { hooks: [audit(ctx)] },
    ],
    PostToolUse: [{ matcher: 'mcp__blender__.*|mcp__unreal__.*', hooks: [trimHeavyOutput] }],
    Stop: [{ hooks: [costLedger(ctx)] }],
    SubagentStop: [{ hooks: [costLedger(ctx)] }],
  };
}
