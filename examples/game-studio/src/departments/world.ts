import { agent, promptAgent } from '../agents';
import { LIMITS, REVIEW, loadConfig } from '../config';
import { reviewGate } from '../loop/review-gate';
import { checkGate } from '../loop/quality-gates';
import { lastJson, runAgent, totalCost } from '../run-agent';
import type { StudioCtx } from '../pipeline';

interface WorldgenConfig { biomes: { id: string; slice: boolean }[]; seeds: { slice: number[] } }
interface Validation { seed: number; reachable_pct: number; poi_count: number; stuck_cells: number; gen_ms: number }

export interface WorldResult { maps: string[]; seeds: number[]; costUsd: number }

/**
 * World & Level: seed -> biome graph -> terrain -> POI placement -> navmesh -> validation.
 * Generation itself is deterministic Python (pipelines/worldgen/*.py) driven through
 * mcp__forge__generate_world; agents only choose parameters and judge results.
 * Several seeds are generated in parallel so the slice ships with a known-good set.
 */
export async function runWorld(ctx: StudioCtx, input: { gdd: string; seed: number }): Promise<WorldResult> {
  const cfg = loadConfig<WorldgenConfig>('worldgen');
  const biome = cfg.biomes.find((b) => b.slice)?.id ?? 'ashen_shoals';
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'world' };

  // 1. Planner turns the GDD world section into a biome graph + generation params.
  const planner = promptAgent('worldgen-planner', 'Designs biome graph and generation params', ['Read', 'Write'], {
    biome, seed: input.seed, gdd_world: input.gdd.slice(0, 6_000),
  });
  const plan = await runAgent(planner, 'Write worldgen/params.json and explain the island graph in <= 150 words.', { ...base, ...LIMITS.specialist });

  // 2. Fan-out: one world-builder session per seed, in parallel.
  const seeds = [input.seed, ...cfg.seeds.slice].slice(0, 4);
  const builds = await Promise.all(seeds.map((seed) => runAgent(agent('world-builder'), [
    `Generate archipelago seed ${seed} for biome ${biome} with mcp__forge__generate_world (params: worldgen/params.json).`,
    'Then place POIs, build the navmesh in Unreal, and run pipelines/worldgen/navmesh_check.py.',
    'End with JSON {"seed","reachable_pct","poi_count","stuck_cells","gen_ms","map"}.',
  ].join('\n'), { ...base, ...LIMITS.dcc, servers: ['unreal'] })));

  // 3. Deterministic gate per seed, then a craft review on the best one.
  const results = builds.map((b) => ({ run: b, v: lastJson<Validation & { map: string }>(b.text) }));
  const good = results.filter(({ v }) => checkGate('worldgen', v as unknown as Record<string, number>).pass);
  if (!good.length) throw new Error(`world: no seed passed the worldgen gate (${seeds.join(', ')})`);

  const best = good.sort((a, b) => b.v.reachable_pct - a.v.reachable_pct)[0];
  const review = await reviewGate({
    name: `world.${best.v.seed}`, producer: agent('world-builder'), evaluator: agent('art-director'),
    artifact: best.run.text, rubric: 'landmark readability, traversal rhythm, beacon sightlines, no dead-end islands',
    cwd: ctx.cwd, ...REVIEW.craft,
  });

  const costUsd = totalCost([plan, ...builds]) + review.costUsd;
  ctx.charge('world', costUsd);
  return { maps: good.map(({ v }) => v.map), seeds: good.map(({ v }) => v.seed), costUsd };
}
