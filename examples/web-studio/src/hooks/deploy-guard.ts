import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * Production is a human decision. Agents may create preview deployments freely, but any
 * production deploy, promote, rolling-release completion or production migration is
 * escalated to the studio lead ("ask"), and destructive commands are denied outright.
 */
const PROD = /vercel\s+(deploy\s+.*--prod|promote|rolling-release\s+(complete|start))|payload\s+migrate(?!:create|:status).*--prod/;
const DENY = /(migrate:fresh|migrate:reset|drop\s+table|vercel\s+remove|rm\s+-rf\s+\/)/i;

export const deployGuard: HookCallback = async (input) => {
  const pre = input as PreToolUseHookInput;
  const command = String((pre.tool_input as { command?: string }).command ?? '');
  const decision = (permissionDecision: 'deny' | 'ask', reason: string) => ({
    hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision, permissionDecisionReason: reason },
  });
  if (DENY.test(command)) return decision('deny', 'Destructive command blocked on client projects.');
  const vercelProd = pre.tool_name.startsWith('mcp__vercel__') && /promote|production/.test(JSON.stringify(pre.tool_input));
  if (PROD.test(command) || vercelProd) {
    return decision('ask', 'Production change: needs client sign-off on record and studio lead approval.');
  }
  return {};
};
