import { PATHS, REVIEW } from './config';
import { greenlight } from './greenlight';
import { runProducer } from './studio';
import { runResearch } from './departments/research';
import { runPreproduction } from './departments/preproduction';
import { runArt } from './departments/art';
import { runEngine } from './departments/engine';
import { runWorld } from './departments/world';
import { runEngineering } from './departments/engineering';
import { runQa } from './departments/qa';
import { runRelease } from './departments/release';
import { runMarketing } from './departments/marketing';
import { awaitApproval } from './tools/request-approval';

const PHASES = ['greenlight', 'preproduction', 'production', 'qa', 'release', 'launch'] as const;
type Phase = (typeof PHASES)[number];

export interface StudioCtx {
  runId: string;
  cwd: string;
  /** Records spend per department and throws once the studio budget is exhausted. */
  charge: (department: string, usd: number) => void;
}

export interface StudioResult {
  status: 'shipped' | 'parked' | 'declined' | 'failed';
  phase: Phase;
  costUsd: number;
  notes: string[];
}

/**
 * Prompt chaining with gates. Each phase only starts when the previous one passed its
 * gate; production departments run in parallel (Promise.all) and fan back in at the
 * Unreal integration step. Humans own greenlight, art direction and release go/no-go.
 */
export async function runStudio(opts: { pitch: string; runId: string; budgetUsd: number; from?: Phase; dryRun: boolean }): Promise<StudioResult> {
  const ledger = new Map<string, number>();
  const spent = () => [...ledger.values()].reduce((a, b) => a + b, 0);
  const ctx: StudioCtx = {
    runId: opts.runId,
    cwd: PATHS.workspace,
    charge(department, usd) {
      ledger.set(department, (ledger.get(department) ?? 0) + usd);
      if (spent() > opts.budgetUsd) throw new Error(`studio budget exceeded in ${department}: $${spent().toFixed(2)}`);
    },
  };
  const done = (status: StudioResult['status'], phase: Phase, notes: string[]): StudioResult =>
    ({ status, phase, costUsd: spent(), notes: [...notes, ...[...ledger].map(([d, usd]) => `${d}: $${usd.toFixed(2)}`)] });
  const start = PHASES.indexOf(opts.from ?? 'greenlight');

  // 1. Pitch & Greenlight (human gate)
  const gl = await greenlight(opts.pitch, opts.runId, ctx.cwd);
  ctx.charge('greenlight', gl.costUsd);
  if (!gl.approved) return done('declined', 'greenlight', [gl.notes]);

  // 2. Research fan-out, then pre-production (GDD + narrative + economy, design-critic loop)
  const research = await runResearch(ctx, { genre: gl.intake.genre, pillars: gl.pillars, scan: gl.scan });
  const pre = await runPreproduction(ctx, { pitch: opts.pitch, pillars: gl.pillars, research: research.report });
  if (pre.escalated.length) return done('parked', 'preproduction', [`design loop escalated: ${pre.escalated.join(', ')}`]);
  if (opts.dryRun) return done('parked', 'preproduction', ['dry run: stopping before production spend']);

  // 3. Production: departments in parallel, producer tracks the milestone
  if (start <= PHASES.indexOf('production')) {
    const [art, world, eng] = await Promise.all([
      runArt(ctx, { gdd: pre.gdd, assets: pre.assetList }),
      runWorld(ctx, { gdd: pre.gdd, seed: pre.worldSeed }),
      runEngineering(ctx, { gdd: pre.gdd, features: pre.features }),
    ]);
    if (art.rejected) return done('parked', 'production', ['art direction sign-off withheld']);
    const engine = await runEngine(ctx, { manifest: art.exported, maps: world.maps, branch: eng.branch });
    const milestone = await runProducer({ runId: ctx.runId, cwd: ctx.cwd, milestone: 'vertical-slice', gdd: pre.gdd, budgetUsd: opts.budgetUsd - spent() });
    ctx.charge('producer', milestone.costUsd);
    if (milestone.status === 'blocked' || !engine.playable) return done('parked', 'production', milestone.risks);
  }

  // 4. QA + regression loop; marketing runs alongside on the captured slice
  let qa = await runQa(ctx, { buildId: `${ctx.runId}-rc1` });
  const marketing = runMarketing(ctx, { pillars: gl.pillars, research: research.report, buildId: `${ctx.runId}-rc1` });
  for (let cycle = 1; !qa.pass && cycle <= REVIEW.regressionCycles; cycle++) {
    await runEngineering(ctx, { gdd: pre.gdd, features: qa.bugs.map((b) => `fix ${b.id}: ${b.title}`) });
    qa = await runQa(ctx, { buildId: `${ctx.runId}-rc${cycle + 1}` });
  }
  if (!qa.pass) return done('parked', 'qa', [`${qa.bugs.length} blocking bugs after ${REVIEW.regressionCycles} regression cycles`]);

  // 5. Release go/no-go (human) and launch
  const release = await runRelease(ctx, { version: '0.1.0-slice', qaSummary: qa.summary });
  if (!release.shipped) return done('parked', 'release', [release.notes]);
  const launch = await marketing;
  const signoff = await awaitApproval('milestone_review', `Shipped ${release.buildId}. Campaign: ${launch.assets.join(', ')}`);
  return done('shipped', 'launch', [release.notes, signoff.notes]);
}
