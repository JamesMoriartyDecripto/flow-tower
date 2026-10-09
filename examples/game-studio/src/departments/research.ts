import { agent, promptAgent } from '../agents';
import { LIMITS } from '../config';
import { lastJson, runAgent, totalCost } from '../run-agent';
import type { StudioCtx } from '../pipeline';

export interface ResearchReport {
  report: string;
  competitors: { title: string; price: number; reviews: number; hook: string }[];
  costUsd: number;
}

/** One question per researcher: narrow scopes keep each context small and citable. */
const QUESTIONS = (genre: string) => [
  { who: 'market-analyst', q: `Top 8 ${genre} releases since 2023 on Steam: price, review count, est. revenue band, launch window.` },
  { who: 'market-analyst', q: `Wishlist-to-sales and follower signals for co-op survival roguelites; what drove the top 3 launches.` },
  { who: 'web-researcher', q: `What do players praise and complain about in ${genre} co-op games? Cite Steam reviews, Reddit threads.` },
  { who: 'web-researcher', q: 'Unreal Engine 5.6 procedural foliage and PCG framework limits for floating-island terrain. Cite docs.' },
  { who: 'web-researcher', q: 'Accessibility expectations for third-person co-op (Game Accessibility Guidelines, Xbox AGs): HUD, controls, captions.' },
] as const;

/**
 * Parallelization (sectioning): five isolated research sessions run with Promise.all,
 * then one synthesis pass merges them into a cited brief for pre-production.
 * Researchers have read-only web tools; nothing they read is treated as instructions.
 */
export async function runResearch(ctx: StudioCtx, brief: { genre: string; pillars: string[]; scan: string }): Promise<ResearchReport> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'research', ...LIMITS.specialist };

  const tracks = await Promise.all(QUESTIONS(brief.genre).map(({ who, q }) =>
    runAgent(agent(who), [
      `Question: ${q}`,
      `Design pillars for relevance: ${brief.pillars.join(' / ')}`,
      'Answer in <= 300 words with a "Sources" list (URL + date). Mark anything unverified as [unverified].',
    ].join('\n'), { ...base, servers: who === 'market-analyst' ? ['analytics'] : [] }),
  ));
  const failed = tracks.filter((t) => !t.ok).length;
  if (failed > 2) throw new Error(`research: ${failed}/${tracks.length} tracks failed`);

  // Fan-in: the market analyst synthesizes and extracts the comparables table.
  const synthesis = await runAgent(agent('market-analyst'), [
    'Merge these research notes into one brief: market size, comparables, player expectations, tech risks, positioning gaps.',
    `Prior quick scan:\n${brief.scan.slice(0, 2_000)}`,
    ...tracks.map((t, i) => `--- track ${i + 1} ---\n${t.text}`),
    'End with JSON {"competitors":[{"title","price","reviews","hook"}]} (max 8).',
  ].join('\n\n'), { ...base, maxBudgetUsd: 1.5 });

  const summarizer = promptAgent('standup-summary', 'Digest writer', [], {
    events: `research complete: ${tracks.length} tracks, ${failed} failed`,
    date: new Date().toISOString().slice(0, 10),
  });
  const digest = await runAgent(summarizer, 'Write the research digest for #studio-standup.', { ...base, ...LIMITS.cheap });

  const all = [...tracks, synthesis, digest];
  ctx.charge('research', totalCost(all));
  return {
    report: synthesis.text,
    competitors: lastJson<Pick<ResearchReport, 'competitors'>>(synthesis.text).competitors,
    costUsd: totalCost(all),
  };
}
