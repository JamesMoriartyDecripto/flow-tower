import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadAgentFiles } from './agents';
import { LIMITS, PATHS } from './config';
import { reviewLoop } from './loop/review-loop';
import { verify } from './loop/verify';
import { appendRun } from './memory/session-log';
import { runLead, type Worktree } from './orchestrator';
import { runAgent } from './run-agent';
import { openPr } from './tools/open-pr';
import { requestApproval } from './tools/request-approval';
import { triage } from './triage';
import type { Issue } from './main';

const sh = promisify(execFile);
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? '').join('');

/**
 * Prompt chain with gates: triage -> (quickfix | lead) -> review loop -> fresh
 * verifier -> draft PR -> human approval. Every arrow is a programmatic check,
 * so a failed step stops the chain instead of flowing garbage downstream.
 */
export async function deliver(issue: Issue): Promise<void> {
  const { stdout } = await sh('gh', ['issue', 'list', '-R', issue.repo, '--json', 'title', '-q', '.[].title']);
  const t = await triage(issue, stdout.split('\n'));
  let cost = 0;
  const done = (outcome: Parameters<typeof appendRun>[0]['outcome'], rounds: number, lesson: string) =>
    appendRun({ issue: issue.number, outcome, rounds, costUsd: cost, lesson });

  if (t.route === 'reject') return comment(issue, `Dev Squad will not pick this up: ${t.rationale}`);
  if (t.route === 'needs_info') {
    await comment(issue, `Before we start, could you clarify:\n${t.questions.map((q) => `- ${q}`).join('\n')}`);
    return done('needs_info', 0, t.rationale);
  }

  const wt = await createWorktree(issue);
  let plan = `Single quick fix: ${issue.title}`;

  if (t.route === 'quickfix') {
    const { coder } = loadAgentFiles();
    const fix = await runAgent(coder, `Quick fix for #${issue.number}: ${issue.title}\n\n${issue.body}`, {
      cwd: wt.path, issue: issue.number, permissionMode: 'acceptEdits', ...LIMITS.quickfix,
    });
    cost += fix.costUsd;
  } else {
    const lead = await runLead(issue, t, wt);
    cost += lead.costUsd;
    if (lead.status === 'blocked') return done('blocked', 0, lead.notes);
    plan = lead.plan;
  }

  const loop = await reviewLoop(issue.number, plan, wt);
  cost += loop.costUsd;
  if (loop.outcome === 'escalate') {
    await comment(issue, `Review did not converge after ${loop.rounds} rounds. Open findings:\n` +
      loop.open.map((f) => `- \`${f.file}:${f.line}\` ${f.issue}`).join('\n'));
    return done('escalated', loop.rounds, loop.open[0]?.issue ?? 'no convergence');
  }

  const v = await verify(issue.number, wt);
  cost += v.costUsd;
  if (v.verdict === 'hold') return done('escalated', loop.rounds, `verifier hold: ${v.gaps.join('; ')}`);
  if (cost > LIMITS.issueUsd) console.warn(`[budget] issue #${issue.number} cost $${cost.toFixed(2)}`);

  const pr = text(await openPr.handler({ title: `fix: ${issue.title}`.slice(0, 70), issue: issue.number,
    bodyFile: join(wt.path, '.squad/pr-body.md'), labels: ['dev-squad'] }, undefined));
  const prNumber = Number(pr.match(/\/pull\/(\d+)/)?.[1]);
  await requestApproval.handler({ kind: 'merge', issue: issue.number, pr: prNumber,
    summary: `Verified against ${v.criteria.length} criteria in ${loop.rounds} review round(s). Follow-ups: ${loop.followUps.join('; ') || 'none'}` }, undefined);

  done('pr_open', loop.rounds, loop.followUps[0] ?? 'clean run');
}

async function createWorktree(issue: Issue): Promise<Worktree> {
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-$/, '');
  const branch = `squad/${issue.number}-${slug}`;
  const path = join(PATHS.worktrees, `${issue.number}`);
  await sh('git', ['fetch', 'origin', 'main']);
  await sh('git', ['worktree', 'add', '-B', branch, path, 'origin/main']);
  return { path, branch };
}

const comment = async (issue: Issue, body: string) => {
  await sh('gh', ['issue', 'comment', String(issue.number), '-R', issue.repo, '--body', body]);
};
