import { promptAgent } from '../agents';
import { LIMITS, REVIEW, loadConfig } from '../config';
import { reviewGate } from '../loop/review-gate';
import { compact } from '../prompts';
import { lastJson, runAgent, totalCost } from '../run-agent';
import type { StudioCtx } from '../pipeline';

export interface MarketingResult { positioning: string; assets: string[]; costUsd: number }

/**
 * Marketing & Launch. Positioning first (everything downstream quotes it), then the
 * website, trailer script, store page and social campaign are produced in parallel.
 * The marketing lead reviews each piece against the positioning (max 2 rounds), and
 * the creative director signs off on the trailer. Nothing posts without approval:
 * publishing tools sit behind "ask" in .claude/settings.json.
 */
export async function runMarketing(ctx: StudioCtx, input: { pillars: string[]; research: string; buildId: string }): Promise<MarketingResult> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'marketing', ...LIMITS.specialist };
  const brand = loadConfig<{ ui: unknown }>('style-guide').ui;
  const pillars = input.pillars.join(' / ');

  const positioning = await runAgent(
    promptAgent('positioning', 'Positioning statement and audience', ['Read', 'WebSearch'], { market_report: input.research.slice(0, 8_000), pillars }),
    'Return the positioning statement, 3 audiences, 5 key messages, then JSON {"statement","features":[...]}.',
    base,
  );
  const pos = lastJson<{ statement: string; features: string[] }>(positioning.text);

  const lead = promptAgent('marketing-lead', 'Campaign owner and reviewer', ['Read', 'Grep'], {
    competitors: input.research.slice(0, 4_000), pillars, launch_date: '2027-02-18 (Steam Next Fest)',
  });

  const jobs = {
    website: promptAgent('web-developer', 'Landing page + press kit', ['Read', 'Write', 'Edit', 'Bash'], {
      brand_tokens: compact(brand), store_url: 'https://store.steampowered.com/app/3391840/Emberwake/',
    }),
    trailer: promptAgent('trailer-writer', '60s/90s trailer script + shot list', ['Read', 'Write'], {
      pillars, key_moments: `captured from ${input.buildId}: beacon ignition, wisp swarm, island drift`,
    }),
    store_page: promptAgent('store-page-writer', 'Steam store copy + tags', ['Read', 'Write'], {
      positioning: pos.statement, features: pos.features.join('; '),
    }),
    social: promptAgent('community-manager', 'Social + Discord campaign', ['Read', 'Write'], {
      channel: 'x, bluesky, reddit r/survivalgaming, discord #announcements', announcement: pos.statement,
    }),
  };

  // Parallel production, each with its own review loop by the marketing lead.
  const results = await Promise.all(Object.entries(jobs).map(async ([name, writer]) => {
    const draft = await runAgent(writer, `Positioning: ${pos.statement}\nProduce the ${name} deliverable under marketing/${name}/.`, base);
    const gate = await reviewGate({
      name: `marketing.${name}`, producer: writer, evaluator: lead, artifact: draft.text,
      rubric: 'on-positioning, concrete not generic, no claims the slice cannot show, platform rules (Steam capsule text limits)',
      cwd: ctx.cwd, ...REVIEW.craft,
    });
    return { name, cost: draft.costUsd + gate.costUsd, pass: gate.outcome === 'pass' };
  }));

  const costUsd = totalCost([positioning]) + results.reduce((s, r) => s + r.cost, 0);
  ctx.charge('marketing', costUsd);
  return { positioning: pos.statement, assets: results.filter((r) => r.pass).map((r) => r.name), costUsd };
}
