import type { HookCallback, HookInput } from '@anthropic-ai/claude-agent-sdk';
import { argv, env, exit, stdin, stdout } from 'node:process';
import { createRun } from '../config';
import { a11yGate } from './a11y-gate';
import { piiScan } from './pii-scan';
import { readabilityFeedback, readingLevelGate } from './reading-level';
import { sourceLicense } from './source-license';

/**
 * Bridge for interactive Claude Code sessions (.claude/settings.json "command" hooks).
 * Reads the hook JSON from stdin, runs the same in-process guard, prints its JSON output.
 * Under the SDK pipeline (FORGE_SDK=1) the guards already run in-process, so this exits 0.
 */
const GUARDS: Record<string, HookCallback> = {
  'source-license': sourceLicense,
  'reading-level': readingLevelGate,
  'readability-feedback': readabilityFeedback,
  'pii-scan': piiScan,
  'a11y-gate': a11yGate(createRun(env.FORGE_RUN ?? 'interactive')),
};

async function main() {
  if (env.FORGE_SDK === '1') exit(0);
  const guard = GUARDS[argv[2] ?? ''];
  if (!guard) {
    console.error(`unknown hook "${argv[2]}"; expected one of ${Object.keys(GUARDS).join(', ')}`);
    exit(1);
  }
  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  const input = JSON.parse(raw) as HookInput;
  const output = await guard(input, undefined, { signal: new AbortController().signal });
  stdout.write(JSON.stringify(output ?? {}));
}

main().catch((err) => {
  // Fail closed for guards: a crashing guard blocks the tool call (exit 2) instead of allowing it.
  console.error(`[hook] ${argv[2]} crashed: ${err instanceof Error ? err.message : err}`);
  exit(2);
});
