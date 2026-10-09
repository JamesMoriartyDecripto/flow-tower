import { agent } from '../agents';
import { LIMITS, REVIEW, loadConfig } from '../config';
import { reviewGate } from '../loop/review-gate';
import { registry } from '../memory/asset-registry';
import { lastJson, runAgent, totalCost } from '../run-agent';
import { awaitApproval } from '../tools/request-approval';
import type { AssetBrief } from './preproduction';
import type { StudioCtx } from '../pipeline';

export interface ArtResult { exported: string[]; rejected: boolean; escalated: string[]; costUsd: number }

const RUBRIC = 'silhouette readability at 30 m, ember & slate palette, texel density, budget compliance, style-guide tokens';

/**
 * Concept -> art director gate (max 3 rounds) -> human art direction sign-off ->
 * per asset, modelling then materials + rigging in parallel -> export -> validation.
 * Assets themselves are processed in parallel, capped to protect the Blender farm.
 */
export async function runArt(ctx: StudioCtx, input: { gdd: string; assets: AssetBrief[] }): Promise<ArtResult> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'art' };
  const style = JSON.stringify(loadConfig('style-guide'));
  const director = agent('art-director');
  let cost = 0;

  // 1. Concepts, each gated by the Opus art director in a fresh session per round.
  const concepts = await Promise.all(input.assets.map((a) => reviewGate({
    name: `concept.${a.id}`,
    producer: agent('concept-artist'),
    evaluator: director,
    artifact: `Concept sheet for ${a.id} (${a.kind}): ${a.brief}\nStyle tokens: ${style}`,
    rubric: RUBRIC,
    cwd: ctx.cwd,
    ...REVIEW.concept,
  })));
  cost += concepts.reduce((s, c) => s + c.costUsd, 0);

  // 2. Human art direction sign-off on the whole set before any 3D spend.
  const signoff = await awaitApproval('art_direction', concepts
    .map((c, i) => `${input.assets[i].id}: ${c.outcome} (score ${c.score}, ${c.rounds} rounds)`).join('\n'));
  if (!signoff.approved) { ctx.charge('art', cost); return { exported: [], rejected: true, escalated: [], costUsd: cost }; }

  // 3. Asset production: fan-out per asset (max 3 concurrent Blender sessions).
  const budgets = loadConfig<Record<string, unknown>>('asset-budgets');
  const exported: string[] = [];
  const escalated: string[] = [];
  for (let i = 0; i < input.assets.length; i += 3) {
    const batch = input.assets.slice(i, i + 3);
    const results = await Promise.all(batch.map(async (a, j) => {
      const concept = concepts[i + j].artifact;
      const brief = `Asset ${a.id} (${a.kind}). Budget: ${JSON.stringify(budgets[a.kind])}\nApproved concept:\n${concept}`;
      const model = await runAgent(agent('blender-modeler'), `${brief}\nBlock out, sculpt, retopo, UV. Save to assets/${a.id}.blend.`,
        { ...base, ...LIMITS.dcc, servers: ['blender'] });

      // Materials and rig only need the retopologized mesh: run them side by side.
      const [mats, rig] = await Promise.all([
        runAgent(agent('material-artist'), `${brief}\nBake + author PBR materials for assets/${a.id}.blend.`, { ...base, ...LIMITS.dcc, servers: ['blender'] }),
        a.kind === 'hero' || a.kind === 'creature'
          ? runAgent(agent('rigger'), `${brief}\nRig assets/${a.id}.blend (UE5 Mannequin-compatible names).`, { ...base, ...LIMITS.dcc, servers: ['blender'] })
          : Promise.resolve({ text: '{"skipped":true}', costUsd: 0, sessionId: '', ok: true }),
      ]);

      // 4. Art director review of the finished asset, max 2 rounds (modeler fixes).
      const review = await reviewGate({
        name: `asset.${a.id}`, producer: agent('blender-modeler'), evaluator: director,
        artifact: `assets/${a.id}.blend\n${mats.text}\n${rig.text}`, rubric: RUBRIC, cwd: ctx.cwd, ...REVIEW.assets,
      });
      const out = lastJson<{ export?: string }>(mats.text).export ?? `export/${a.id}.glb`;
      await registry.upsert({ id: a.id, path: out, kind: a.kind, status: review.outcome === 'pass' ? 'approved' : 'needs_review' });
      return { id: a.id, out, review, cost: totalCost([model, mats, rig]) + review.costUsd };
    }));
    for (const r of results) {
      cost += r.cost;
      (r.review.outcome === 'pass' ? exported : escalated).push(r.review.outcome === 'pass' ? r.out : r.id);
    }
  }

  ctx.charge('art', cost);
  return { exported, rejected: false, escalated, costUsd: cost };
}
