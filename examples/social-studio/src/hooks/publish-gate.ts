import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * PreToolUse hook on every agent session. Agents draft; people approve; only the publisher
 * worker posts. Any tool that would publish, reply, message or spend money is denied here,
 * except creating PAUSED Meta campaigns (a person still has to switch them on).
 */
const DENY = [
  /^mcp__.*__(create_post|publish|post_comment|reply_comment|add_comment|send_message|boost_post)/,
  /^mcp__meta_ads__.*(update|delete|activate|budget)/i,
  /^mcp__studio__(publish|send_reply)/,
];

export const publishGate: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PreToolUse') return {};
  const name = (input as PreToolUseHookInput).tool_name;
  if (DENY.some((re) => re.test(name))) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${name} publishes or spends. Call request_approval instead; the worker publishes after a person approves.`,
      },
    };
  }
  return {};
};
