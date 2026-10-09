import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agent, promptAgent } from '../agents';
import { LIMITS, PATHS, REVIEW } from '../config';
import { reviewGate } from '../loop/review-gate';
import { renderPrompt, untrusted } from '../prompts';
import { lastJson, runAgent, totalCost } from '../run-agent';
import type { StudioCtx } from '../pipeline';

export interface AssetBrief { id: string; kind: 'hero' | 'creature' | 'prop' | 'environment'; brief: string }

export interface Preproduction {
  gdd: string;
  features: string[];
  assetList: AssetBrief[];
  worldSeed: number;
  escalated: string[];
  costUsd: number;
}

/**
 * Pre-production: the game designer, narrative writer and economy balancer work in
 * parallel from the same pillars; then each GDD section goes through the Opus design
 * critic (evaluator-optimizer, max 3 rounds, pass >= 8/10). Sections that do not
 * converge are escalated to the creative director instead of looping forever.
 */
export async function runPreproduction(ctx: StudioCtx, input: { pitch: string; pillars: string[]; research: string }): Promise<Preproduction> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'preproduction', ...LIMITS.specialist };
  const template = await readFile(join(PATHS.workspace, 'docs/gdd-template.md'), 'utf8').catch(() => '');
  const context = `Pillars: ${input.pillars.join(' / ')}\n${untrusted(input.pitch, 'pitch')}\nResearch brief:\n${input.research.slice(0, 6_000)}`;

  const [design, narrative, economy] = await Promise.all([
    runAgent(agent('game-designer'), `${context}\n\nWrite the GDD (core loop, mechanics, progression, controls) using:\n${template}`, base),
    runAgent(agent('narrative-writer'), `${context}\n\nWrite the world premise, 3 characters, slice storyboard beats (docs/storyboard-template.md).`, base),
    runAgent(agent('economy-balancer'), `${context}\n\nDraft config/economy.yaml (resources, sinks, crafting) and simulate 200 runs.`, base),
  ]);

  const sections = { core_loop: design.text, narrative: narrative.text, economy: economy.text };
  const critic = promptAgent('design-critic', 'Grades GDD sections against the pillars', ['Read', 'Grep'], {
    gdd_section: '(attached per round)', pillars: input.pillars.join(' / '), round: 1, max_rounds: REVIEW.design.maxRounds,
  });
  const owners = { core_loop: 'game-designer', narrative: 'narrative-writer', economy: 'economy-balancer' } as const;

  // Sections are independent: their review loops also run in parallel.
  const gates = await Promise.all(Object.entries(sections).map(([name, artifact]) =>
    reviewGate({
      name: `gdd.${name}`,
      producer: agent(owners[name as keyof typeof owners]),
      evaluator: critic,
      artifact,
      rubric: renderPrompt('review-round', {
        artifact: `GDD section "${name}"`, rubric: 'pillar fit, clarity, testability, scope for a 20-min slice',
        round: 1, max_rounds: REVIEW.design.maxRounds, previous_findings: 'none',
      }),
      cwd: ctx.cwd,
      ...REVIEW.design,
    })));

  const gdd = gates.map((g, i) => `## ${Object.keys(sections)[i]}\n\n${g.artifact}`).join('\n\n');
  await writeFile(join(PATHS.workspace, 'docs/gdd.md'), gdd);

  const plan = lastJson<{ features: string[]; assets: AssetBrief[]; world_seed: number }>(
    (await runAgent(agent('game-designer'), `From this GDD, list slice features, the asset list and a world seed as JSON.\n${gdd}`, { ...base, maxTurns: 6 })).text,
  );

  const costUsd = totalCost([design, narrative, economy]) + gates.reduce((s, g) => s + g.costUsd, 0);
  ctx.charge('preproduction', costUsd);
  return {
    gdd,
    features: plan.features,
    assetList: plan.assets,
    worldSeed: plan.world_seed,
    escalated: Object.keys(sections).filter((_, i) => gates[i].outcome === 'escalate'),
    costUsd,
  };
}
