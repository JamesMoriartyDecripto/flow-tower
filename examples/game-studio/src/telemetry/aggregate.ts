import { readFile } from 'node:fs/promises';

/** Shape written by the game's telemetry writer for each bot run (see src/tools/run-playtest.ts). */
interface BotRun {
  seed: number;
  persona: string;
  duration_s: number;
  completed: boolean;
  crashed: boolean;
  deaths: { x: number; y: number; cause: string }[];
  stuck_events: { x: number; y: number; seconds: number }[];
  fps: { avg: number; p5: number; min?: number };
  milestones: string[]; // e.g. landed, first_craft, lantern_t2, beacon_1, beacon_2, beacon_3, extract
}

export interface Hotspot { kind: 'death' | 'stuck'; x: number; y: number; count: number; topCause: string }

export interface TelemetrySummary {
  runs: number;
  completionRate: number;
  crashRate: number;
  stuckPerRun: number;
  fps: { avg: number; p5: number; min: number };
  hotspots: Hotspot[];
  funnel: { step: string; rate: number }[];
  slowSeeds: number[];
  byPersona: Record<string, { runs: number; completionRate: number }>;
}

const FUNNEL = ['landed', 'first_craft', 'lantern_t2', 'beacon_1', 'beacon_2', 'beacon_3', 'extract'];
const CELL = 2_000; // 20 m grid cells (Unreal units are cm)

/**
 * Turns N parallel bot runs into the numbers the gates and the QA lead care about.
 * Hotspots are binned on a coarse grid so 40 bots dying at the same cliff become
 * one actionable finding instead of 40 bug reports.
 */
export async function aggregate(files: string[]): Promise<TelemetrySummary> {
  const runs = (await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, 'utf8')) as BotRun)))
    .filter((r) => r && typeof r.seed === 'number');
  const n = Math.max(runs.length, 1);

  const bins = new Map<string, Hotspot & { causes: Record<string, number> }>();
  const bin = (kind: Hotspot['kind'], x: number, y: number, cause: string) => {
    const bx = Math.round(x / CELL) * CELL;
    const by = Math.round(y / CELL) * CELL;
    const key = `${kind}:${bx}:${by}`;
    const h = bins.get(key) ?? { kind, x: bx, y: by, count: 0, topCause: cause, causes: {} };
    h.count += 1;
    h.causes[cause] = (h.causes[cause] ?? 0) + 1;
    h.topCause = Object.entries(h.causes).sort((a, b) => b[1] - a[1])[0][0];
    bins.set(key, h);
  };
  for (const r of runs) {
    r.deaths.forEach((d) => bin('death', d.x, d.y, d.cause));
    r.stuck_events.forEach((s) => bin('stuck', s.x, s.y, `stuck ${Math.round(s.seconds)}s`));
  }

  const fpsP5 = runs.map((r) => r.fps.p5).sort((a, b) => a - b);
  const byPersona: TelemetrySummary['byPersona'] = {};
  for (const r of runs) {
    const p = (byPersona[r.persona] ??= { runs: 0, completionRate: 0 });
    p.completionRate = (p.completionRate * p.runs + (r.completed ? 1 : 0)) / (p.runs + 1);
    p.runs += 1;
  }

  return {
    runs: runs.length,
    completionRate: runs.filter((r) => r.completed).length / n,
    crashRate: runs.filter((r) => r.crashed).length / n,
    stuckPerRun: runs.reduce((s, r) => s + r.stuck_events.length, 0) / n,
    fps: {
      avg: runs.reduce((s, r) => s + r.fps.avg, 0) / n,
      p5: fpsP5[Math.floor(fpsP5.length * 0.05)] ?? 0,
      min: Math.min(...runs.map((r) => r.fps.min ?? r.fps.p5)),
    },
    hotspots: [...bins.values()].filter((h) => h.count >= 3).sort((a, b) => b.count - a.count)
      .map(({ causes: _c, ...h }) => h),
    funnel: FUNNEL.map((step) => ({ step, rate: runs.filter((r) => r.milestones.includes(step)).length / n })),
    slowSeeds: [...new Set(runs.filter((r) => r.fps.p5 < 45).map((r) => r.seed))].slice(0, 10),
    byPersona,
  };
}
