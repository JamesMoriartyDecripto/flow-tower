import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { HookCallback, StopHookInput } from '@anthropic-ai/claude-agent-sdk';
import { appendSessionEntry } from '../memory/session-log';

const run = promisify(execFile);
const SOURCE = /^(src|lib|app|packages\/[^/]+\/src)\//;

async function changedFiles(cwd: string): Promise<string[]> {
  const { stdout } = await run('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd });
  const { stdout: dirty } = await run('git', ['status', '--porcelain'], { cwd });
  return [...stdout.split('\n'), ...dirty.split('\n').map((l) => l.slice(3))].filter(Boolean);
}

/**
 * Stop hook. Two jobs:
 *  1. Definition of done: source changed but CHANGELOG.md did not -> block the stop
 *     and tell the agent what is missing. `stop_hook_active` prevents an infinite loop.
 *  2. Memory: append a session-log entry so the next run starts with what we learned.
 */
export function changelogGate(ctx: { issue: number }): HookCallback {
  return async (input) => {
    const stop = input as StopHookInput;
    const files = await changedFiles(stop.cwd).catch(() => []);
    const touchedSource = files.some((f) => SOURCE.test(f));
    const touchedChangelog = files.includes('CHANGELOG.md');

    if (touchedSource && !touchedChangelog && !stop.stop_hook_active) {
      console.log(`[hook] Stop changelog-gate block issue=#${ctx.issue} (source changed, no CHANGELOG entry)`);
      return {
        decision: 'block' as const,
        reason:
          'Source files changed but CHANGELOG.md has no entry. Ask the doc-writer to add one under ' +
          `## [Unreleased] referencing #${ctx.issue}, then finish.`,
      };
    }

    console.log(`[hook] Stop changelog-gate allow issue=#${ctx.issue} files=${files.length}`);
    await appendSessionEntry({
      issue: ctx.issue,
      sessionId: stop.session_id,
      files: files.length,
      summary: (stop.last_assistant_message ?? '').slice(0, 280),
    });
    return {};
  };
}
