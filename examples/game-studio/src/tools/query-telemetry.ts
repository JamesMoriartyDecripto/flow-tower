import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT } from '../config';
import { aggregate } from '../telemetry/aggregate';

/**
 * One read-only door to telemetry, two sources:
 *  - "bots":    local playtest bot JSON from run_playtest, aggregated (deaths, stuck points, fps)
 *  - "players": human playtest sessions in PostHog via HogQL (closed beta only)
 * Agents get summaries and top-N lists, never raw event streams.
 */
export const queryTelemetry = tool(
  'query_telemetry',
  'Summarize playtest telemetry for a build: completion funnel, death/stuck hotspots, fps percentiles, crash rate. ' +
    'source "bots" for automated playtests, "players" for human sessions (PostHog).',
  {
    build_id: z.string().regex(/^[\w.-]+$/),
    source: z.enum(['bots', 'players']).default('bots'),
    focus: z.enum(['overview', 'hotspots', 'performance', 'funnel']).default('overview'),
  },
  async ({ build_id, source, focus }) => {
    if (source === 'players') {
      const hogql = `SELECT event, count() AS n, quantile(0.05)(toFloat(properties.fps)) AS fps_p5
        FROM events WHERE properties.build_id = '${build_id.replace(/'/g, '')}' AND timestamp > now() - INTERVAL 14 DAY
        GROUP BY event ORDER BY n DESC LIMIT 25`;
      const res = await fetch(`${env.POSTHOG_HOST ?? 'https://eu.posthog.com'}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.POSTHOG_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
      });
      if (!res.ok) return { content: [{ type: 'text', text: `PostHog query failed: ${res.status}` }], isError: true };
      const { results } = (await res.json()) as { results: [string, number, number][] };
      return { content: [{ type: 'text', text: results.map(([e, n, p5]) => `${e}: ${n}${p5 ? ` (fps p5 ${p5.toFixed(0)})` : ''}`).join('\n') }] };
    }

    const dir = join(ROOT, '.forge', 'playtests', build_id);
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
    if (!files.length) return { content: [{ type: 'text', text: `No bot telemetry for ${build_id}. Run run_playtest first.` }], isError: true };

    const s = await aggregate(files);
    const sections: Record<typeof focus, string[]> = {
      overview: [
        `${s.runs} runs | completion ${(s.completionRate * 100).toFixed(0)}% | crash rate ${(s.crashRate * 100).toFixed(1)}%`,
        `fps avg ${s.fps.avg.toFixed(0)} p5 ${s.fps.p5.toFixed(0)} | stuck/run ${s.stuckPerRun.toFixed(2)}`,
      ],
      hotspots: s.hotspots.slice(0, 8).map((h) => `${h.kind} @ (${h.x}, ${h.y}) x${h.count} — ${h.topCause}`),
      performance: [`fps avg ${s.fps.avg.toFixed(1)}, p5 ${s.fps.p5.toFixed(1)}, min ${s.fps.min.toFixed(1)}`, ...s.slowSeeds.map((x) => `slow seed ${x}`)],
      funnel: s.funnel.map((f) => `${f.step}: ${(f.rate * 100).toFixed(0)}%`),
    };
    return { content: [{ type: 'text', text: sections[focus].join('\n') }] };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } },
);
