import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { argv, exit } from 'node:process';
import { parseArgs } from 'node:util';
import { STUDIO_BUDGET_USD } from './config';
import { runStudio, type StudioResult } from './pipeline';

/**
 * Forge Studio CLI.
 *
 *   npx tsx src/main.ts docs/pitch-emberwake.md
 *   npx tsx src/main.ts docs/pitch-emberwake.md --from production --run 7f3c...
 *
 * One pitch in, a playable vertical slice + launch campaign out. The process is
 * long-lived (days): every human checkpoint parks the run and resumes on approval.
 */
const { values, positionals } = parseArgs({
  args: argv.slice(2),
  allowPositionals: true,
  options: {
    from: { type: 'string' },          // resume at a phase: preproduction | production | qa | release | launch
    run: { type: 'string' },           // reuse a run id (sessions + ledger are keyed by it)
    budget: { type: 'string' },        // override the studio-wide USD ceiling
    'dry-run': { type: 'boolean', default: false },
  },
});

async function main() {
  const pitchFile = positionals[0];
  if (!pitchFile) {
    console.error('usage: main.ts <pitch.md> [--from <phase>] [--run <id>] [--budget <usd>] [--dry-run]');
    exit(2);
  }

  const pitch = await readFile(pitchFile, 'utf8');
  const runId = values.run ?? randomUUID().slice(0, 8);
  const budgetUsd = Number(values.budget ?? STUDIO_BUDGET_USD);
  console.log(`[forge] run ${runId} · budget $${budgetUsd} · pitch ${pitchFile}`);

  const result: StudioResult = await runStudio({
    pitch,
    runId,
    budgetUsd,
    from: values.from as StudioResult['phase'] | undefined,
    dryRun: values['dry-run'] ?? false,
  });

  console.log(`[forge] ${result.status} at phase "${result.phase}" · $${result.costUsd.toFixed(2)}`);
  for (const line of result.notes) console.log(`  - ${line}`);
  exit(result.status === 'shipped' ? 0 : result.status === 'parked' ? 3 : 1);
}

main().catch((err) => {
  console.error('[forge] fatal', err);
  exit(1);
});
