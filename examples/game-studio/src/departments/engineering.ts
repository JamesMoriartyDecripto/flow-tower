import { agent, promptAgent } from '../agents';
import { LIMITS, REVIEW, loadConfig } from '../config';
import { reviewGate } from '../loop/review-gate';
import { checkGate } from '../loop/quality-gates';
import { lastJson, runAgent, totalCost } from '../run-agent';
import type { StudioCtx } from '../pipeline';

interface TechTask { id: string; owner: 'gameplay-programmer' | 'tools-engineer' | 'ui-designer'; spec: string; independent: boolean }
interface PerfReport { p95_frame_ms: number; gpu_ms: number; memory_mb: number; hitches_per_min: number }

export interface EngineeringResult { branch: string; merged: string[]; escalated: string[]; perf?: PerfReport; costUsd: number }

/**
 * Spec -> implement -> code review loop -> perf profile.
 * The Opus technical director splits features into tasks; independent tasks run in
 * parallel, dependent ones in order. Each task passes the Opus code reviewer
 * (max 3 rounds, last fix round escalated to Opus) before it may merge.
 */
export async function runEngineering(ctx: StudioCtx, input: { gdd: string; features: string[] }): Promise<EngineeringResult> {
  const branch = `slice/${ctx.runId}`;
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'engineering' };
  const platforms = loadConfig<{ targets: unknown }>('platforms').targets;
  const perfBudgets = loadConfig<{ perf: unknown }>('quality-gates').perf;

  const td = promptAgent('technical-director', 'Architecture and task split', ['Read', 'Grep', 'Glob'], {
    gdd: input.gdd.slice(0, 10_000), target_platforms: JSON.stringify(platforms), perf_budgets: JSON.stringify(perfBudgets),
  });
  const spec = await runAgent(td, [
    `Features for this pass:\n- ${input.features.join('\n- ')}`,
    'Return JSON {"tasks":[{"id","owner","spec","independent"}]} — one task per PR, <= 300 changed lines each.',
  ].join('\n'), { ...base, ...LIMITS.director });
  const { tasks } = lastJson<{ tasks: TechTask[] }>(spec.text);

  const implement = async (t: TechTask) => {
    const owner = agent(t.owner);
    const work = await runAgent(owner, `Branch ${branch}. Task ${t.id}:\n${t.spec}\nWrite tests (UE Automation / Vitest for tools).`,
      { ...base, ...LIMITS.specialist, permissionMode: 'acceptEdits', servers: t.owner === 'ui-designer' ? ['figma', 'unreal'] : ['unreal'] });
    const review = await reviewGate({
      name: `code.${t.id}`, producer: owner, evaluator: agent('code-reviewer'),
      artifact: `git diff origin/main...${branch} -- task ${t.id}\n${work.text}`,
      rubric: 'correctness, UE5 conventions (UPROPERTY/GC safety, tick cost), replication for co-op, tests present, no hard-coded tuning',
      cwd: ctx.cwd, ...REVIEW.code,
    });
    return { id: t.id, cost: work.costUsd + review.costUsd, pass: review.outcome === 'pass' };
  };

  // Independent tasks fan out; dependent tasks run after, in plan order.
  const parallel = await Promise.all(tasks.filter((t) => t.independent).map(implement));
  const sequential = [];
  for (const t of tasks.filter((t) => !t.independent)) sequential.push(await implement(t));
  const done = [...parallel, ...sequential];

  const profiler = await runAgent(agent('perf-profiler'), [
    `Profile ${branch} on the slice map: Unreal Insights capture, 3 x 5 min automated flythrough.`,
    'Return JSON {"p95_frame_ms","gpu_ms","memory_mb","hitches_per_min"} and the top 5 offenders.',
  ].join('\n'), { ...base, ...LIMITS.specialist, servers: ['unreal'] });
  const perf = lastJson<PerfReport>(profiler.text);
  const gate = checkGate('performance', perf as unknown as Record<string, number>);
  if (!gate.pass) console.warn(`[engineering] perf gate failed: ${gate.reasons.join('; ')}`);

  const costUsd = spec.costUsd + done.reduce((s, d) => s + d.cost, 0) + totalCost([profiler]);
  ctx.charge('engineering', costUsd);
  return {
    branch,
    merged: done.filter((d) => d.pass).map((d) => d.id),
    escalated: done.filter((d) => !d.pass).map((d) => d.id),
    perf,
    costUsd,
  };
}
