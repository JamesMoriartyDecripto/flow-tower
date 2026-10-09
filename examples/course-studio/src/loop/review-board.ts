import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAgentFiles } from '../agents';
import { LIMITS, MODELS, REVIEW, type Run } from '../config';
import type { Intake } from '../intake';
import { renderPrompt, untrusted } from '../prompts';
import { lastJson, runAgent } from '../run-agent';
import { writeModules } from '../pipelines/modules';
import { contentHash } from '../tools/scorm-packager';

interface Blocker { id: string; owner: string; file: string; issue: string; fix: string; from: string[] }
interface Consolidated { round: number; verdict: 'pass' | 'revise' | 'escalate'; blockers: Blocker[]; backlog: unknown[] }

const REVIEWERS = ['pedagogy-reviewer', 'fact-checker', 'accessibility-auditor', 'rights-reviewer'] as const;

/**
 * Evaluator-optimizer, hard-capped at REVIEW.maxRounds. Each round:
 *   1. four reviewers grade the same build IN PARALLEL, each in a fresh session (no anchoring,
 *      no reading each other's reports),
 *   2. an Opus consolidator dedupes, resolves conflicts and decides,
 *   3. owners fix ONLY the blocking findings; the revision before the last round runs on Opus.
 * After the last round the loop stops and a human (the SME) decides.
 */
export async function reviewBoard(run: Run, intake: Intake) {
  const agents = loadAgentFiles();
  const previous = new Map<string, Blocker[]>();
  let costUsd = 0;
  let last: Consolidated | undefined;

  for (let round = 1; round <= REVIEW.maxRounds; round++) {
    const hash = await contentHash(run.dir);
    const reports = await Promise.all(
      REVIEWERS.map(async (name) => {
        const prompt = renderPrompt('review-round', {
          round,
          course_title: intake.title,
          reviewer: name,
          build_hash: hash,
          run_dir: run.dir,
          scope: round === 1 ? 'everything' : 'files changed since the last round + your open findings',
          previous_findings: JSON.stringify(previous.get(name) ?? [], null, 2),
        });
        const r = await runAgent(agents[name], prompt, { run, ...LIMITS.review, label: `${name}-r${round}` });
        costUsd += r.costUsd;
        return r.ok ? r.text : JSON.stringify({ reviewer: name, verdict: 'changes_requested', blocking: [{ issue: `reviewer failed: ${r.text}` }] });
      }),
    );

    const consolidator = {
      description: 'Review consolidator',
      prompt: renderPrompt('consolidator', { round, course_title: intake.title, reports: untrusted(reports.join('\n\n'), 'reports', 40_000) }),
      tools: ['Read'],
      model: MODELS.opus,
    };
    const c = await runAgent(consolidator, 'Consolidate this round. JSON only.', { run, maxTurns: 8, maxBudgetUsd: 1, label: `consolidator-r${round}` });
    costUsd += c.costUsd;
    last = lastJson<Consolidated>(c.text);
    await writeFile(join(run.dir, `review-round-${round}.json`), JSON.stringify(last, null, 2));
    console.log(`[review] round ${round}: ${last.verdict} blockers=${last.blockers.length}`);

    if (last.verdict === 'pass' || last.blockers.length === 0) return { outcome: 'pass' as const, rounds: round, costUsd, report: summarize(last) };
    if (round === REVIEW.maxRounds) break;

    for (const name of REVIEWERS) previous.set(name, last.blockers.filter((b) => b.from.some((f) => name.startsWith(f))));
    const briefs = new Map<number, string>();
    for (const b of last.blockers.filter((x) => x.owner.startsWith('module-writer:m'))) {
      const m = Number(b.owner.split(':m')[1]);
      briefs.set(m, `${briefs.get(m) ?? ''}\n- [${b.id}] ${b.file}: ${b.issue} -> ${b.fix}`);
    }
    const fixes = await writeModules(run, intake, { briefs, round });
    costUsd += fixes.costUsd;
  }
  return { outcome: 'escalate' as const, rounds: REVIEW.maxRounds, costUsd, report: summarize(last!) };
}

const summarize = (c: Consolidated) =>
  `Round ${c.round}: ${c.verdict}. Blockers: ${c.blockers.map((b) => `${b.id} ${b.issue}`).join('; ') || 'none'}. Backlog items: ${c.backlog.length}.`;
