import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HookCallback, StopHookInput } from '@anthropic-ai/claude-agent-sdk';
import { ROOT, STUDIO_BUDGET_USD } from '../config';

/**
 * Stop / SubagentStop. Two jobs:
 *  1. append one line per finished session to memory/session-log.md (the studio journal),
 *  2. keep a per-department cost ledger and stop the run when the studio budget is spent.
 *
 * Cost comes from the SDK result message; the pipeline writes it to .forge/<run>/last-cost
 * right before the session ends, so the hook never has to parse transcripts.
 */
interface Ledger { total: number; departments: Record<string, number> }

const SOFT_LIMIT = 0.8; // warn the producer at 80% of the budget

export function costLedger(ctx: { department: string; runId: string; cwd: string }): HookCallback {
  const dir = join(ctx.cwd, '.forge', ctx.runId);
  const ledgerPath = join(dir, 'ledger.json');

  return async (input) => {
    const stop = input as StopHookInput;
    if (stop.stop_hook_active) return {}; // never loop on our own block

    mkdirSync(dir, { recursive: true });
    const costPath = join(dir, 'last-cost');
    const cost = existsSync(costPath) ? Number(readFileSync(costPath, 'utf8')) || 0 : 0;

    const ledger: Ledger = existsSync(ledgerPath)
      ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
      : { total: 0, departments: {} };
    ledger.total += cost;
    ledger.departments[ctx.department] = (ledger.departments[ctx.department] ?? 0) + cost;
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

    const line = `| ${new Date().toISOString()} | ${ctx.runId} | ${ctx.department} | ${stop.session_id.slice(0, 8)} | $${cost.toFixed(2)} | $${ledger.total.toFixed(2)} |`;
    appendFileSync(join(ROOT, 'memory', 'session-log.md'), `${line}\n`);

    if (ledger.total >= STUDIO_BUDGET_USD) {
      return {
        continue: false,
        stopReason: `Studio budget exhausted ($${ledger.total.toFixed(2)} / $${STUDIO_BUDGET_USD}). ` +
          'The producer must request a milestone_review approval before any further work.',
      };
    }
    if (ledger.total >= STUDIO_BUDGET_USD * SOFT_LIMIT) {
      return {
        systemMessage: `Budget warning: ${Math.round((ledger.total / STUDIO_BUDGET_USD) * 100)}% spent. ` +
          `Top department: ${topDepartment(ledger)}. Prefer cutting scope over cutting review rounds.`,
      };
    }
    return {};
  };
}

function topDepartment(l: Ledger): string {
  const [name, usd] = Object.entries(l.departments).sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
  return `${name} ($${usd.toFixed(2)})`;
}
