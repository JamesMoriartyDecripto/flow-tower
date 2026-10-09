import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * Append-only audit trail (S3 Object Lock, compliance mode, eu-central-1).
 * Records who/what read which document, with which prompt version. Never blocks the agent.
 * Document text is never logged: only ids, pages and hashes.
 */
export function auditLog(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

export function auditHook(ctx: { matterId: string; agent: string; promptVersion: string }): HookCallback {
  return async (input, toolUseId) => {
    const { hook_event_name, tool_name, tool_input } = input as PreToolUseHookInput;
    const { docId, from, to } = (tool_input ?? {}) as { docId?: string; from?: number; to?: number };
    queueMicrotask(() => auditLog({ ...ctx, event: hook_event_name, tool: tool_name, docId, pages: from ? `${from}-${to}` : undefined, toolUseId }));
    return { async: true };
  };
}
