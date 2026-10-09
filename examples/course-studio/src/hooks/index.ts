import type { HookCallback, HookCallbackMatcher, HookEvent, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, ROOT, type Run } from '../config';
import { appendHookLog, gatesPending } from '../memory/session-log';
import { updateTrackerCard } from '../tools/request-signoff';
import { a11yGate } from './a11y-gate';
import { piiScan } from './pii-scan';
import { readabilityFeedback, readingLevelGate } from './reading-level';
import { deny, toolInput } from './decide';
import { sourceLicense } from './source-license';

/** Writes stay inside runs/<slug>/, whatever path the model invents. */
const runFence = (run: Run): HookCallback => async (input) => {
  const path = toolInput(input).file_path ?? '';
  return !path || path.startsWith(`${run.dir}/`) ? {} : deny(`Writes are limited to ${run.dir}.`);
};

/** Answer keys never land in learner-visible files. */
const answerKeyGuard: HookCallback = async (input) => {
  const { file_path = '', content = '', new_string = '' } = toolInput(input);
  if (!/\/(lessons|media)\//.test(file_path)) return {};
  return /"correct"\s*:\s*true|ANSWER KEY|Correct answer:/i.test(content + new_string)
    ? deny('Answer keys and rationales belong in assessment/keys/, not in lesson or media files.')
    : {};
};

/** Marketing copy: no promises the course cannot keep. */
const CLAIMS = [/guarantee[ds]?/i, /\b(certified|accredited)\b/i, /\b(double|triple) your (salary|pay)/i, /only \d+ (seats|spots) left/i, /\b100% (success|pass)/i];
const claimsGuard: HookCallback = async (input) => {
  const { file_path = '', content = '', new_string = '' } = toolInput(input);
  if (!file_path.includes('/marketing/')) return {};
  const hit = CLAIMS.find((re) => re.test(content + new_string));
  return hit ? deny(`Marketing claim not allowed (${hit.source}). See config/quality-gates.yaml#marketing.`) : {};
};

/** Style guide summary, glossary and learned patterns, injected once per session. */
const contextLoader: HookCallback = async () => ({
  hookSpecificOutput: {
    hookEventName: 'SessionStart' as const,
    additionalContext: ['config/style-guide.md', 'memory/glossary.md'].map((f) => readFileSync(resolve(ROOT, f), 'utf8').slice(0, 3000))
      .concat(readFileSync(PATHS.patterns, 'utf8').slice(0, 3000)).join('\n\n---\n\n'),
  },
});

/**
 * Every lifecycle hook Syllabus Forge registers. Matching hooks run in parallel and the
 * most restrictive decision wins (deny > ask > allow). The same guards are mirrored as
 * shell hooks in .claude/settings.json (src/hooks/cli.ts) for interactive sessions.
 */
export function buildHooks(run: Run): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SessionStart: [{ hooks: [contextLoader] }],
    PreToolUse: [
      { matcher: 'Write|Edit|MultiEdit', hooks: [runFence(run), sourceLicense, readingLevelGate, piiScan, answerKeyGuard, claimsGuard] },
      { matcher: 'mcp__studio__scorm_package', hooks: [a11yGate(run)] },
      { hooks: [async (i) => (appendHookLog(run, i as PreToolUseHookInput), { async: true })] },
    ],
    PostToolUse: [{ matcher: 'Write|Edit', hooks: [readabilityFeedback], timeout: 30 }],
    SubagentStop: [{ hooks: [async (i) => (await updateTrackerCard(run, i), {})] }],
    Stop: [{
      hooks: [async () => {
        const pending = await gatesPending(run);
        return pending.length ? { decision: 'block' as const, reason: `Quality gates still pending: ${pending.join(', ')}` } : {};
      }],
    }],
  };
}
