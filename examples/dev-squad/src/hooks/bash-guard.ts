import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { PROTECTED_BRANCHES } from '../config';

/** Hard denials. The model gets the reason so it can pick a safer path instead of retrying. */
const DENY: [RegExp, string][] = [
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME|\.\.?\s*$)/i, 'Recursive delete outside the worktree is never allowed.'],
  [/\bgit\s+push\b.*(--force|-f\b|--mirror)/, 'Force push is disabled. Create a new commit instead.'],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, 'Destructive git commands are disabled; use git stash or a new commit.'],
  [/\bgh\s+pr\s+merge\b|\bgit\s+merge\b.*\b(main|master)\b/, 'Merging is a human decision. Use request_approval.'],
  [/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, 'Piping remote scripts into a shell is not allowed.'],
  [/\b(npm|pnpm|yarn)\s+publish\b|\bnpm\s+version\b/, 'Publishing is done by CI, not by agents.'],
  [/\b(cat|less|head|tail|grep|source)\b.*(\.pem\b|id_rsa|\.npmrc|\.netrc)/, 'Reading credential files is not allowed.'],
  [/\b(printenv|env)\s*($|\|)/, 'Dumping the environment can leak secrets.'],
  [/\bsudo\b|\bchmod\s+777\b/, 'Privilege escalation is not allowed.'],
];

/** Commands that are fine but must be confirmed by a human when not running headless. */
const ASK: [RegExp, string][] = [
  [/\bgit\s+push\b/, 'Pushing publishes the branch.'],
  [/\b(npm|pnpm|yarn)\s+(i|install|add)\s+\S+/, 'Adding a dependency changes the supply chain.'],
  [/\bdocker\b|\bkubectl\b|\bterraform\b/, 'Infrastructure commands need a human.'],
];

const pushesProtected = (cmd: string) =>
  PROTECTED_BRANCHES.some((b) => new RegExp(`\\bgit\\s+push\\b.*\\b${b.replace('*', '.*')}\\b`).test(cmd));

/**
 * PreToolUse(Bash). Runs before permission rules, so a deny here wins even if a
 * permissive allow rule matches. Every decision is explained to the model.
 * `role` is the agent of a runAgent() session (main thread, no agent_type); subagents of the lead carry agent_type.
 * An `ask` needs a human: in headless pipeline runs, headlessPermissions() in run-agent.ts denies it.
 */
export const bashGuard = (role?: string): HookCallback => async (input) => {
  const pre = input as PreToolUseHookInput;
  const command = String((pre.tool_input as { command?: string }).command ?? '');

  const deny = (reason: string) => {
    console.log(`[hook] PreToolUse Bash deny "${command.slice(0, 80)}": ${reason}`);
    return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: reason } };
  };

  if (pushesProtected(command)) return deny('Pushing to a protected branch is not allowed. Push the issue branch only.');
  for (const [pattern, reason] of DENY) if (pattern.test(command)) return deny(reason);

  for (const [pattern, reason] of ASK) {
    if (pattern.test(command)) {
      return {
        hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'ask' as const, permissionDecisionReason: reason },
      };
    }
  }

  // The reviewer must stay read-only, whether it runs as a subagent (agent_type) or as its own session (role).
  if ((pre.agent_type ?? role) === 'reviewer' && !/^git\s+(diff|log|show)\b/.test(command.trim())) {
    return deny('The reviewer is read-only: only git diff/log/show are allowed.');
  }
  return {};
};
