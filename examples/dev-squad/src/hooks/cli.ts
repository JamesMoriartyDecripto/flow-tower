#!/usr/bin/env -S npx tsx
/**
 * Shell adapter so interactive Claude Code sessions (.claude/settings.json) run the
 * SAME guard code as the SDK pipeline. Reads the hook JSON from stdin, prints the
 * hook JSON output on stdout.
 *
 *   npx tsx src/hooks/cli.ts bash-guard < event.json
 */
import { env, exit, stdin, stdout, argv } from 'node:process';
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { bashGuard } from './bash-guard';
import { changelogGate } from './changelog-gate';
import { contextLoader } from './context-loader';
import { formatLint } from './format-lint';
import { secretScanPrompt, secretScanWrite } from './secret-scan';

const issue = Number(env.SQUAD_ISSUE ?? 0);
const HOOKS: Record<string, HookCallback> = {
  'bash-guard': bashGuard,
  'secret-scan-write': secretScanWrite,
  'secret-scan-prompt': secretScanPrompt,
  'format-lint': formatLint,
  'changelog-gate': changelogGate({ issue }),
  'context-loader': contextLoader({ issue }),
};

async function main() {
  // Under the SDK the same callbacks are registered in-process: do not run twice.
  if (env.DEV_SQUAD_SDK === '1') exit(0);

  const hook = HOOKS[argv[2] ?? ''];
  if (!hook) {
    console.error(`unknown hook "${argv[2]}". Known: ${Object.keys(HOOKS).join(', ')}`);
    exit(1);
  }

  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  const output = await hook(JSON.parse(raw), undefined, { signal: AbortSignal.timeout(55_000) });
  stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  // Exit code 2 = blocking error in Claude Code; fail closed for guards.
  console.error(`hook ${argv[2]} crashed: ${err}`);
  exit(2);
});
