import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT } from '../config';

const run = promisify(execFile);
const PY = 'python3';

interface WorldSummary {
  seed: number;
  islands: number;
  biomes: Record<string, number>;
  pois: Record<string, number>;
  reachable_pct: number;
  unreachable_pois: string[];
  heightmaps: string[];
}

/**
 * Deterministic procedural world generation, step by step:
 *   biome_graph.py -> terrain_heightmap.py -> poi_placement.py -> navmesh_check.py
 * Every stage reads config/worldgen.yaml and writes into .forge/worlds/<seed>/, so
 * the same seed always produces the same archipelago (reproducible bugs).
 * Import into Unreal is a separate step (pipelines/unreal/build_level.py).
 */
export const generateWorld = tool(
  'generate_world',
  'Generate a seeded archipelago (biome graph, island heightmaps, POI placement, reachability check). ' +
    'Returns a compact summary; run with several seeds and compare before picking one for the level.',
  {
    seed: z.number().int().nonnegative(),
    biome: z.string().default('ashen_shoals'),
    islands: z.number().int().min(3).max(40).default(12),
    stage: z.enum(['all', 'biome_graph', 'terrain', 'pois', 'navmesh']).default('all'),
  },
  async ({ seed, biome, islands, stage }) => {
    const out = join(ROOT, '.forge', 'worlds', String(seed));
    await mkdir(out, { recursive: true });
    const cfg = join(ROOT, 'config', 'worldgen.yaml');
    const steps: [string, string[]][] = [
      ['biome_graph', ['biome_graph.py', '--seed', String(seed), '--biome', biome, '--islands', String(islands)]],
      ['terrain', ['terrain_heightmap.py', '--seed', String(seed)]],
      ['pois', ['poi_placement.py', '--seed', String(seed)]],
      ['navmesh', ['navmesh_check.py']],
    ];

    for (const [name, [script, ...args]] of steps) {
      if (stage !== 'all' && stage !== name) continue;
      try {
        await run(PY, ['-I', join(ROOT, 'pipelines/worldgen', script), ...args, '--config', cfg, '--out', out], { timeout: 300_000 });
      } catch (err) {
        const msg = (err as { stderr?: string }).stderr?.split('\n').slice(-6).join('\n') ?? String(err);
        return { content: [{ type: 'text', text: `worldgen stage ${name} failed for seed ${seed}:\n${msg}` }], isError: true };
      }
    }

    const s = JSON.parse(await readFile(join(out, 'summary.json'), 'utf8')) as WorldSummary;
    const fmt = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k}:${v}`).join(' ');
    const text = [
      `seed ${s.seed}: ${s.islands} islands | biomes ${fmt(s.biomes)}`,
      `POIs ${fmt(s.pois)}`,
      `reachable ${s.reachable_pct.toFixed(1)}%${s.unreachable_pois.length ? ` | UNREACHABLE: ${s.unreachable_pois.slice(0, 8).join(', ')}` : ''}`,
      `heightmaps: ${s.heightmaps.length} (r16) in ${out}`,
    ].join('\n');
    return { content: [{ type: 'text', text }], isError: s.unreachable_pois.length > 0 };
  },
  { annotations: { idempotentHint: true } },
);
