import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HookCallback, SessionStartHookInput } from '@anthropic-ai/claude-agent-sdk';
import { ROOT } from '../config';
import { recallPatterns } from '../memory/store';

/** Context is finite: every department gets a pack capped at this size. */
const MAX_CHARS = 7_000;

/** Which memory files matter to which department. Art does not need the economy ADRs. */
const DEPARTMENT_MEMORY: Record<string, string[]> = {
  art: ['art-bible.md'],
  assets: ['art-bible.md'],
  engine: ['art-bible.md', 'decisions.md'],
  world: ['art-bible.md', 'decisions.md'],
  design: ['decisions.md', 'playtest-insights.md'],
  engineering: ['decisions.md'],
  qa: ['playtest-insights.md'],
  research: ['competitors.md'],
  marketing: ['competitors.md', 'art-bible.md'],
};

function excerpt(file: string, maxLines = 40): string {
  try {
    return readFileSync(join(ROOT, 'memory', file), 'utf8').split('\n').slice(0, maxLines).join('\n');
  } catch {
    return '';
  }
}

/**
 * SessionStart. CLAUDE.md is loaded by settingSources; this adds the dynamic,
 * department-specific memory: learned DO/DON'T rules, the art bible excerpt and
 * the latest design decisions. Re-injected after compaction so rules survive.
 */
export function contextLoader(ctx: { department: string; runId: string }): HookCallback {
  return async (input) => {
    const start = input as SessionStartHookInput;
    if (start.source === 'clear') return {};

    const files = DEPARTMENT_MEMORY[ctx.department] ?? ['decisions.md'];
    const sections = files.map((f) => `## memory/${f}\n${excerpt(f)}`);
    const patterns = recallPatterns([ctx.department, '*']);

    const pack = [
      `# Forge Studio context — run ${ctx.runId}, department ${ctx.department}`,
      '## Learned patterns (follow these)',
      patterns || '- none yet',
      ...sections,
    ].join('\n\n');

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart' as const,
        additionalContext: pack.slice(0, MAX_CHARS),
      },
    };
  };
}
