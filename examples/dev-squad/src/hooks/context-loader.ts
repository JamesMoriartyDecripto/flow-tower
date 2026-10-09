import type { HookCallback, SessionStartHookInput } from '@anthropic-ai/claude-agent-sdk';
import { recentEntries } from '../memory/session-log';
import { recallPatterns } from '../memory/store';

/** Rough budget for injected memory. Context is a finite resource: spend it on signal. */
const MAX_CHARS = 6_000;

/**
 * SessionStart. CLAUDE.md is already loaded via settingSources; this adds the
 * dynamic part: learned DO/DON'T rules and the last few session outcomes.
 * On `compact` it re-injects the same pack so rules survive summarization.
 */
export function contextLoader(ctx: { issue: number; areas?: string[] }): HookCallback {
  return async (input) => {
    const start = input as SessionStartHookInput;
    if (start.source === 'clear') return {};

    const patterns = recallPatterns(ctx.areas ?? []);
    const recent = recentEntries(5)
      .map((e) => `- #${e.issue} ${e.outcome} (${e.rounds} review rounds): ${e.lesson}`)
      .join('\n');

    const pack = [
      `# Dev Squad context for issue #${ctx.issue}`,
      '## Learned patterns (follow these)',
      patterns || '- none yet',
      '## Recent runs',
      recent || '- none yet',
    ].join('\n');

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart' as const,
        additionalContext: pack.slice(0, MAX_CHARS),
      },
    };
  };
}
