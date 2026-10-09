import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * Anything that reaches users is a human decision. Builds, internal and beta submissions pass.
 * Production submissions, rollout increases, review replies and OTA updates to production need
 * an approval id from request_approval in the tool input. Halting is always allowed (safe direction).
 * Credentials are never read by an agent: they are passed to tools by environment variable name.
 */
const APPROVAL = /appr_[a-z0-9_]+/;
const NEEDS_APPROVAL: [RegExp, string][] = [
  [/eas\s+submit\b.*--profile\s+production/, 'Production store submission'],
  [/eas\s+update\b.*--(channel|branch)\s+production/, 'OTA update to production'],
  [/eas\s+update:edit|eas\s+channel:rollout/, 'OTA rollout change'],
  [/play-rollout\.ts\s+(0?\.\d+|1|resume)\b/, 'Play rollout increase'],
  [/fastlane\s+android\s+rollout/, 'Play rollout increase'],
  [/fastlane\s+ios\s+metadata/, 'Public listing change'],
];
const DENY = /(credentials\/|\.p8\b|\.jks\b|\.keystore\b|service-account.*\.json|eas\s+credentials|security\s+find-identity|keytool\s+-list)/i;

const decision = (permissionDecision: 'deny' | 'ask', reason: string) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision, permissionDecisionReason: reason },
});

export const releaseGuard: HookCallback = async (input) => {
  const pre = input as PreToolUseHookInput;
  const raw = JSON.stringify(pre.tool_input);
  const command = String((pre.tool_input as { command?: string }).command ?? '');

  // Signing material: deny reads and listings outright, for every tool.
  if (DENY.test(raw)) return decision('deny', 'Signing keys and store credentials are not readable by agents.');

  // Store submission through the Expo MCP server counts as a production submit unless it targets beta.
  if (pre.tool_name === 'mcp__expo__build_submit' && !/beta|internal|alpha/.test(raw) && !APPROVAL.test(raw)) {
    return decision('ask', 'Production submission without an approval id from the product owner.');
  }
  // Public review replies go out only after the support lead approved the draft.
  if (/reply|customerReviewResponses/i.test(pre.tool_name) && !APPROVAL.test(raw)) {
    return decision('ask', 'Review reply needs the support lead approval id.');
  }
  for (const [re, what] of NEEDS_APPROVAL) {
    if (re.test(command) && !APPROVAL.test(command)) return decision('ask', `${what}: include the approval id from request_approval.`);
  }
  return {};
};
