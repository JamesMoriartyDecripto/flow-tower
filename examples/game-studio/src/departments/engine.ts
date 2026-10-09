import { agent, promptAgent } from '../agents';
import { LIMITS, REVIEW } from '../config';
import { reviewGate } from '../loop/review-gate';
import { checkGate } from '../loop/quality-gates';
import { lastJson, runAgent, totalCost } from '../run-agent';
import type { StudioCtx } from '../pipeline';

export interface EngineResult { level: string; playable: boolean; costUsd: number; notes: string[] }

const LEVEL = '/Game/Maps/AshenShoals_Slice';

/**
 * Fan-in point of production. The integration lead imports every approved asset into
 * Unreal (pipelines/unreal/import_assets.py), creates material instances, then the
 * animator, lighting artist and audio designer work in parallel on the integrated level.
 * Craft reviews (art director / technical director) are capped at 2 rounds.
 */
export async function runEngine(ctx: StudioCtx, input: { manifest: string[]; maps: string[]; branch: string }): Promise<EngineResult> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'engine', servers: ['unreal'] };

  const lead = promptAgent('integration-lead', 'Unreal integration coordinator',
    ['Read', 'mcp__unreal__run_python', 'mcp__unreal__list_assets', 'mcp__unreal__take_screenshot'],
    { asset_manifest: input.manifest.join('\n'), level: LEVEL });

  // 1. Sequential: import + material instances must exist before anyone animates or lights.
  const integrate = await runAgent(lead, [
    `Import ${input.manifest.length} assets with pipelines/unreal/import_assets.py (glTF, Nanite on for static meshes).`,
    'Then run pipelines/unreal/material_instances.py against config/style-guide.json.',
    `Stream in sublevels: ${input.maps.join(', ')} via pipelines/unreal/level_streaming.py.`,
    `Gameplay code is on branch ${input.branch}; do not edit C++.`,
    'End with JSON {"imported":n,"failed":[...],"missing_refs":[...]}.',
  ].join('\n'), { ...base, ...LIMITS.dcc });
  const report = lastJson<{ imported: number; failed: string[]; missing_refs: string[] }>(integrate.text);

  // 2. Parallel craft passes on the same level (different sublevels / asset folders).
  const [anim, light, audio] = await Promise.all([
    runAgent(agent('animator'), `Build ABP_Keeper and ABP_CinderWisp (pipelines/unreal/anim_blueprint.py), retarget from the Blender rigs, author the 3 slice cinematics with pipelines/unreal/sequencer_shots.py in ${LEVEL}.`, { ...base, ...LIMITS.dcc }),
    runAgent(agent('lighting-artist'), `Light ${LEVEL}: Lumen GI, dusk key + ember fill, exposure locked. Stay inside perf budgets (config/quality-gates.yaml).`, { ...base, ...LIMITS.dcc }),
    runAgent(agent('audio-designer'), 'Write SFX + music briefs for the slice (spot list per beat), check licenses of every reference track.', { ...base, ...LIMITS.specialist, servers: [] }),
  ]);

  // 3. Lighting gets the art director's eye on screenshots (2 rounds max).
  const lightingReview = await reviewGate({
    name: 'lighting.slice', producer: agent('lighting-artist'), evaluator: agent('art-director'),
    artifact: light.text, rubric: 'mood vs art bible, value grouping, readability of interactables, no blown highlights',
    cwd: ctx.cwd, ...REVIEW.craft,
  });

  const metrics = lastJson<{ gpu_ms: number; draw_calls: number }>(light.text);
  const gate = checkGate('engine_integration', { failed_imports: report.failed.length, missing_refs: report.missing_refs.length, ...metrics });

  const costUsd = totalCost([integrate, anim, light, audio]) + lightingReview.costUsd;
  ctx.charge('engine', costUsd);
  return {
    level: LEVEL,
    playable: gate.pass && lightingReview.outcome === 'pass',
    costUsd,
    notes: [...gate.reasons, ...lightingReview.open.map((f) => `lighting: ${f.issue}`)],
  };
}
