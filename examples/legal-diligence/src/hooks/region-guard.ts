import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * Client data must stay in the EU and inside the matter. Agents get no web access at all
 * (the docstore MCP is the only source); this guard is defense in depth if a tool list
 * is ever widened by mistake.
 */
const deny = (reason: string) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: reason },
});

export const regionGuard: HookCallback = async (input) => {
  const { tool_name } = input as PreToolUseHookInput;
  if (tool_name === 'WebFetch' || tool_name === 'WebSearch') return deny('No web access on client matters.');
  if (tool_name === 'Bash') return deny('No shell on client matters.');
  return {};
};
