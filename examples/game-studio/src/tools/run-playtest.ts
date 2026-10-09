import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT } from '../config';

const run = promisify(execFile);

/** Persona -> bot policy knobs passed to pipelines/playtest/bot_policy.py via the game's -BotPolicy arg. */
const PERSONAS = {
  explorer: 'Maximizes map coverage, opens every chest, ignores the beacon objective until 70% explored.',
  speedrunner: 'Beelines to beacons, skips crafting unless blocked, uses movement exploits.',
  hoarder: 'Gathers every resource, crafts everything, stresses the economy and inventory UI.',
  newcomer: 'Ignores tooltips, wanders, retries failed jumps; measures onboarding friction.',
  griefer: 'Co-op stress: blocks doorways, drops items, spams interactions to find desyncs.',
} as const;

interface Telemetry {
  seed: number;
  duration_s: number;
  completed: boolean;
  crashed: boolean;
  deaths: { x: number; y: number; cause: string }[];
  stuck_events: { x: number; y: number; seconds: number }[];
  fps: { avg: number; p5: number };
  beacons_lit: number;
  errors: string[];
}

/**
 * Launches the packaged Win64 dev build headless with an automated bot (Gauntlet-style),
 * one persona and one world seed. Many of these run in parallel from src/departments/qa.ts.
 */
export const runPlaytest = tool(
  'run_playtest',
  'Run one automated playtest bot on a build: persona + world seed + time limit. Returns a compact telemetry summary ' +
    'and the path of the full telemetry JSON. Use different seeds to cover procedural variety.',
  {
    build_id: z.string().regex(/^[\w.-]+$/),
    persona: z.enum(Object.keys(PERSONAS) as [keyof typeof PERSONAS, ...(keyof typeof PERSONAS)[]]),
    seed: z.number().int().nonnegative(),
    minutes: z.number().int().min(2).max(30).default(15),
  },
  async ({ build_id, persona, seed, minutes }) => {
    const outDir = join(ROOT, '.forge', 'playtests', build_id);
    await mkdir(outDir, { recursive: true });
    const out = join(outDir, `${persona}-${seed}.json`);
    const exe = join(env.FORGE_BUILDS_DIR ?? join(ROOT, 'Builds'), build_id, 'Windows', 'Emberwake.exe');

    await run(exe, [
      '-nullrhi=0', '-windowed', '-ResX=1280', '-ResY=720', '-unattended', '-nosound',
      `-WorldSeed=${seed}`, `-BotPersona=${persona}`, `-BotPolicy=${join(ROOT, 'pipelines/playtest/bot_policy.py')}`,
      `-PlaytestMinutes=${minutes}`, `-TelemetryOut=${out}`,
    ], { timeout: (minutes + 3) * 60_000 }).catch(() => undefined); // a crash still writes telemetry

    const t = JSON.parse(await readFile(out, 'utf8').catch(() => 'null')) as Telemetry | null;
    if (!t) return { content: [{ type: 'text', text: `No telemetry: build ${build_id} failed to boot.` }], isError: true };

    const causes = Object.entries(t.deaths.reduce<Record<string, number>>((m, d) => ({ ...m, [d.cause]: (m[d.cause] ?? 0) + 1 }), {}));
    const text = [
      `${persona} seed=${seed} ${t.completed ? 'COMPLETED' : 'incomplete'}${t.crashed ? ' CRASHED' : ''} in ${Math.round(t.duration_s / 60)}m`,
      `beacons=${t.beacons_lit} deaths=${t.deaths.length} (${causes.map(([c, n]) => `${c}:${n}`).join(', ') || '-'})`,
      `stuck=${t.stuck_events.length} fps avg=${t.fps.avg} p5=${t.fps.p5}`,
      ...t.errors.slice(0, 5).map((e) => `! ${e}`),
      `telemetry: ${out}`,
    ];
    return { content: [{ type: 'text', text: text.join('\n') }], isError: t.crashed };
  },
);
