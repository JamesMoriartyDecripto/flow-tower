#!/usr/bin/env -S npx tsx
/**
 * Shell adapter so interactive Claude Code sessions (.claude/settings.json) run the
 * SAME guard code as the SDK pipeline. Reads the hook JSON on stdin and prints the
 * hook JSON output on stdout.
 *
 *   npx tsx src/hooks/cli.ts asset-budget < event.json
 */
import { argv, cwd, env, exit, stdin, stdout } from 'node:process';
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { assetBudget } from './asset-budget';
import { buildGate } from './build-gate';
import { contextLoader } from './context-loader';
import { costLedger } from './cost-ledger';
import { licenseCheck } from './license-check';
import { secretScanPrompt, secretScanWrite } from './secret-scan';

const ctx = {
  department: env.FORGE_DEPARTMENT ?? 'interactive',
  runId: env.FORGE_RUN_ID ?? 'local',
  cwd: env.CLAUDE_PROJECT_DIR ?? cwd(),
};

const HOOKS: Record<string, HookCallback> = {
  'asset-budget': assetBudget,
  'license-check': licenseCheck,
  'secret-scan-write': secretScanWrite,
  'secret-scan-prompt': secretScanPrompt,
  'build-gate': buildGate(ctx),
  'context-loader': contextLoader(ctx),
  'cost-ledger': costLedger(ctx),
};

async function main() {
  // Under the SDK the same callbacks are registered in-process: do not run twice.
  if (env.FORGE_SDK === '1') exit(0);

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
  // Exit code 2 = blocking error in Claude Code; guards fail closed.
  console.error(`hook ${argv[2]} crashed: ${err}`);
  exit(2);
});
