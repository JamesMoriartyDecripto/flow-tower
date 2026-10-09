import { promptAgent } from '../agents';
import { LIMITS } from '../config';
import { checkGate } from '../loop/quality-gates';
import { compact } from '../prompts';
import { lastJson, runAgent, totalCost } from '../run-agent';
import { aggregate } from '../telemetry/aggregate';
import type { StudioCtx } from '../pipeline';

export interface Bug { id: string; title: string; severity: 'S1' | 'S2' | 'S3' | 'S4'; owner: string; dupes: number }
export interface QaResult { pass: boolean; bugs: Bug[]; summary: string; costUsd: number }

const PERSONAS = ['speedrunner', 'explorer', 'griefer', 'new_player', 'completionist', 'co_op_pair'] as const;
const OWNERS = { gameplay: 'gameplay-programmer', ui: 'ui-designer', world: 'world-builder', art: 'blender-modeler', perf: 'perf-profiler' };

/**
 * QA & Playtest. The QA lead writes a test matrix; persona-driven Haiku bots play the
 * packaged build in parallel (each via mcp__forge__run_playtest, headless, seeded);
 * telemetry is aggregated deterministically; a Haiku triager dedupes and routes bugs.
 * The pipeline loops back into engineering for at most 2 regression cycles.
 */
export async function runQa(ctx: StudioCtx, input: { buildId: string }): Promise<QaResult> {
  const base = { cwd: ctx.cwd, runId: ctx.runId, department: 'qa' };

  const lead = promptAgent('qa-lead', 'Plans the playtest matrix', ['Read', 'mcp__forge__query_telemetry'], {
    build_id: input.buildId, test_plan: 'docs/gdd.md#slice-acceptance',
  });
  const plan = await runAgent(lead, `Return JSON {"runs":[{"persona","objective","seed"}]} using personas ${PERSONAS.join(', ')}; max 18 runs.`,
    { ...base, ...LIMITS.specialist });
  const { runs } = lastJson<{ runs: { persona: string; objective: string; seed: number }[] }>(plan.text);

  // Fan-out: every bot is its own cheap session. Bots cannot read code or write files.
  const bots = await Promise.all(runs.map((r) => runAgent(
    promptAgent('playtest-bot', `Bot ${r.persona}`, ['mcp__forge__run_playtest'], { persona: r.persona, objective: r.objective, seed: r.seed }),
    `Play build ${input.buildId}. Report what blocked you. End with JSON {"telemetry":"<path>","bugs":[...]}.`,
    { ...base, ...LIMITS.bot, servers: [] },
  )));
  const reports = bots.filter((b) => b.ok).map((b) => lastJson<{ telemetry: string; bugs: unknown[] }>(b.text));
  const telemetry = await aggregate(reports.map((r) => r.telemetry));

  // Fan-in: dedupe + severity + owner routing on Haiku.
  const triager = promptAgent('bug-triage', 'Dedupes and routes bugs', [], {
    bug_reports: compact(reports.flatMap((r) => r.bugs), 12_000),
    owners: compact(OWNERS),
  });
  const triage = await runAgent(triager, 'Return JSON {"bugs":[{"id","title","severity","owner","dupes"}]}.', { ...base, ...LIMITS.cheap });
  const { bugs } = lastJson<{ bugs: Bug[] }>(triage.text);

  // UX research reads the same telemetry for friction, not bugs.
  const ux = await runAgent(
    promptAgent('ux-researcher', 'Heuristic + telemetry UX review', ['Read', 'mcp__forge__query_telemetry'], { build_id: input.buildId, personas: PERSONAS.join(', ') }),
    `Telemetry summary:\n${compact(telemetry)}\nList the top 5 friction points with evidence.`,
    { ...base, ...LIMITS.specialist },
  );

  const gate = checkGate('qa', {
    s1_bugs: bugs.filter((b) => b.severity === 'S1').length,
    s2_bugs: bugs.filter((b) => b.severity === 'S2').length,
    crash_rate: telemetry.crashRate,
    completion_rate: telemetry.completionRate,
    p95_frame_ms: telemetry.p95FrameMs,
  });

  const costUsd = totalCost([plan, ...bots, triage, ux]);
  ctx.charge('qa', costUsd);
  return {
    pass: gate.pass,
    bugs: bugs.filter((b) => b.severity === 'S1' || b.severity === 'S2'),
    summary: [`${bots.length} bot runs, ${bugs.length} unique bugs`, ...gate.reasons, ux.text.slice(0, 1_500)].join('\n'),
    costUsd,
  };
}
