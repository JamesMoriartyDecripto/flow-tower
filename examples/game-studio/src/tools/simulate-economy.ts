import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { loadConfig } from '../config';

/**
 * Monte-carlo economy simulation over config/economy.yaml. Designers argue about
 * numbers; this gives them the same numbers to argue about.
 *
 *   resources: { ember_shard: { sources: { wisp_kill: [1, 3], node_mine: [2, 4] } } }
 *   recipes:   { lantern_t2: { ember_shard: 12, driftwood: 6 } }
 *   target_curve: { beacon_1: 4, beacon_2: 9, beacon_3: 16 }   # minutes
 */
interface Economy {
  resources: Record<string, { sources: Record<string, [number, number]> }>;
  actions_per_minute: Record<string, number>;
  recipes: Record<string, Record<string, number>>;
  progression: string[]; // recipe ids that gate each beacon, in order
  target_curve: Record<string, number>;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const simulateEconomy = tool(
  'simulate_economy',
  'Simulate N players through the crafting progression and compare time-to-beacon against the target curve. ' +
    'Optional overrides let you test a change without editing config/economy.yaml.',
  {
    runs: z.number().int().min(100).max(20_000).default(2_000),
    seed: z.number().int().default(7),
    overrides: z.record(z.string(), z.number()).optional().describe('e.g. {"recipes.lantern_t2.ember_shard": 10}'),
  },
  async ({ runs, seed, overrides }) => {
    const eco = structuredClone(loadConfig<Economy>('economy'));
    for (const [path, value] of Object.entries(overrides ?? {})) {
      const keys = path.split('.');
      const last = keys.pop()!;
      const target = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, eco as unknown as Record<string, unknown>);
      target[last] = value;
    }

    const rand = mulberry32(seed);
    const times: Record<string, number[]> = Object.fromEntries(eco.progression.map((r) => [r, []]));

    for (let i = 0; i < runs; i++) {
      const bag: Record<string, number> = {};
      let minute = 0;
      for (const recipe of eco.progression) {
        const cost = eco.recipes[recipe];
        while (Object.entries(cost).some(([res, n]) => (bag[res] ?? 0) < n) && minute < 120) {
          minute += 1;
          for (const [res, def] of Object.entries(eco.resources)) {
            for (const [action, [lo, hi]] of Object.entries(def.sources)) {
              const acts = (eco.actions_per_minute[action] ?? 0) * (0.7 + rand() * 0.6); // player skill spread
              bag[res] = (bag[res] ?? 0) + acts * (lo + rand() * (hi - lo));
            }
          }
        }
        for (const [res, n] of Object.entries(cost)) bag[res] -= n;
        times[recipe].push(minute);
      }
    }

    const lines = eco.progression.map((recipe, i) => {
      const sorted = times[recipe].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const target = Object.values(eco.target_curve)[i];
      const flag = Math.abs(p50 - target) / target > 0.2 ? '  <-- off target by >20%' : '';
      return `${recipe}: p50=${p50}m p90=${p90}m target=${target}m${flag}`;
    });
    return { content: [{ type: 'text', text: [`${runs} simulated players, seed ${seed}`, ...lines].join('\n') }] };
  },
  { annotations: { readOnlyHint: true, idempotentHint: true } },
);
