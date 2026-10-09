import type { HookCallbackMatcher, HookEvent } from '@anthropic-ai/claude-agent-sdk';
import { auditHook } from './audit';
import { regionGuard } from './region-guard';

/** Hooks every diligence agent runs with. The most restrictive decision wins. */
export function buildHooks(ctx: { matterId: string; agent: string; promptVersion: string }): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [
      { matcher: 'WebFetch|WebSearch|Bash', hooks: [regionGuard] },
      { hooks: [auditHook(ctx)] },
    ],
    PostToolUse: [{ hooks: [auditHook(ctx)] }],
  };
}
