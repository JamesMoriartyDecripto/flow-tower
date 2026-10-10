import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadAgentFiles } from './agents';
import { LIMITS, PATHS, PLAN_GATE } from './config';
import { awaitApproval } from './loop/await-approval';
import { reviewLoop } from './loop/review-loop';
import { verify } from './loop/verify';
import { appendRun } from './memory/session-log';
import { promoteRecurring } from './memory/store';
import { runLead, type Worktree } from './orchestrator';
import { runAgent } from './run-agent';
import { openPr } from './tools/open-pr';
import { requestApproval } from './tools/request-approval';
import { triage } from './triage';
import type { Issue } from './main';

const sh = promisify(execFile);
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? '').join('');

class OverBudget extends Error {}

/**
 * Prompt chain with gates: triage -> (quickfix | lead) -> review loop -> fresh
 * verifier -> draft PR -> human approval. Every arrow is a programmatic check,
 * so a failed step stops the chain instead of flowing garbage downstream.
 * Any throw (gh, git, an agent's JSON, open_pr) and the whole-issue budget end here:
 * the issue gets a comment and the run journal an entry, instead of a silent crash.
 */
export async function deliver(issue: Issue): Promise<void> {
  const run = { cost: 0 };
  try {
    await stages(issue, run);
  } catch (err) {
    const over = err instanceof OverBudget;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[squad] #${issue.number} ${over ? 'over budget' : 'failed'}: ${message}`);
    await comment(issue, over ? `Dev Squad stopped: ${message}` : `Dev Squad stopped on an error: ${message}\nThe worktree is kept for debugging.`)
      .catch(() => undefined);
    appendRun({ issue: issue.number, outcome: over ? 'over_budget' : 'failed', rounds: 0, costUsd: run.cost, lesson: message.slice(0, 200) });
  }
}

async function stages(issue: Issue, run: { cost: number }): Promise<void> {
  const spend = (usd: number) => {
    run.cost += usd;
    if (run.cost > LIMITS.issueUsd) throw new OverBudget(`cost $${run.cost.toFixed(2)} passed the $${LIMITS.issueUsd} issue budget.`);
  };
  const done = (outcome: Parameters<typeof appendRun>[0]['outcome'], rounds: number, lesson: string) =>
    appendRun({ issue: issue.number, outcome, rounds, costUsd: run.cost, lesson });

  const { stdout } = await sh('gh', ['issue', 'list', '-R', issue.repo, '--json', 'title', '-q', '.[].title']);
  const t = await triage(issue, stdout.split('\n'));
  if (t.route === 'reject') {
    await comment(issue, `Dev Squad will not pick this up: ${t.rationale}`);
    return done('rejected', 0, t.rationale);
  }
  if (t.route === 'needs_info') {
    await comment(issue, `Before we start, could you clarify:\n${t.questions.map((q) => `- ${q}`).join('\n')}`);
    return done('needs_info', 0, t.rationale);
  }

  const wt = await createWorktree(issue);
  let plan = `Single quick fix: ${issue.title}`;

  if (t.route === 'quickfix') {
    const { coder, 'doc-writer': docWriter } = loadAgentFiles();
    const base = { cwd: wt.path, issue: issue.number, areas: t.areas, permissionMode: 'acceptEdits' as const };
    spend((await runAgent(coder, `Quick fix for #${issue.number}: ${issue.title}\n\n${issue.body}`, { ...base, role: 'coder', ...LIMITS.quickfix })).costUsd);
    // On the full route the lead's doc-writer does this; without it the Stop gate and open_pr have nothing to work with.
    spend((await runAgent(docWriter, `Quick fix for #${issue.number} (${issue.title}) is done on ${wt.branch}. ` +
      'Add the CHANGELOG.md entry and write .squad/pr-body.md.', { ...base, role: 'doc-writer', ...LIMITS.docs })).costUsd);
  } else {
    let since = new Date();
    let lead = await runLead(issue, t, wt);
    spend(lead.costUsd);
    // Plan sign-off: the lead asked and ended its session; resume it with the human's answer.
    for (let revisions = 0; lead.status === 'awaiting_approval'; revisions++) {
      const answer = await awaitApproval(issue, since);
      if (answer.kind === 'timeout' || (answer.kind === 'revise' && revisions >= PLAN_GATE.maxRevisions)) {
        const why = answer.kind === 'timeout' ? `no plan decision within ${PLAN_GATE.approvalTimeoutMin} min` : `plan still not approved after ${PLAN_GATE.maxRevisions} revisions`;
        await comment(issue, `Dev Squad paused: ${why}. Label \`squad:go\` again to restart.`);
        return done('blocked', 0, why);
      }
      since = new Date();
      lead = await runLead(issue, t, wt, {
        sessionId: lead.sessionId,
        answer: answer.kind === 'revise' ? `Revise the plan: ${answer.notes}`
          : answer.notes ? `The plan is approved with these changes: ${answer.notes}\nApply them; for each part moved out of scope, call file_followup. Then continue from step 3.`
          : 'The plan is approved. Continue from step 3.',
      });
      spend(lead.costUsd);
    }
    if (lead.status === 'blocked') return done('blocked', 0, lead.notes);
    plan = lead.plan;
  }

  const loop = await reviewLoop(issue.number, plan, wt);
  spend(loop.costUsd);
  const promoted = promoteRecurring(loop.seen, t.areas, issue.number);
  if (promoted) console.log(`[memory] #${issue.number} promoted ${promoted} recurring finding(s) to patterns.md`);
  const findings = loop.seen.map((f) => f.issue).join('; ');
  if (loop.outcome === 'escalate') {
    await comment(issue, `Review did not converge after ${loop.rounds} rounds. Open findings:\n` +
      loop.open.map((f) => `- \`${f.file}:${f.line}\` ${f.issue}`).join('\n'));
    return done('escalated', loop.rounds, findings || 'no convergence');
  }

  const v = await verify(issue.number, wt);
  spend(v.costUsd);
  if (v.verdict === 'hold') {
    await comment(issue, `The fresh verifier held the change:\n${v.gaps.map((g) => `- ${g}`).join('\n')}`);
    return done('escalated', loop.rounds, `verifier hold: ${v.gaps.join('; ')}`);
  }

  const pr = await openPr(wt.path).handler({ title: `fix: ${issue.title}`.slice(0, 70), issue: issue.number,
    bodyFile: '.squad/pr-body.md', labels: ['dev-squad'] }, undefined);
  if (pr.isError) throw new Error(`open_pr: ${text(pr)}`);
  const prNumber = Number(text(pr).match(/\/pull\/(\d+)/)?.[1]);
  console.log(`[pipeline] draft PR ${text(pr)} ← ${wt.branch}`);
  await requestApproval(wt.path).handler({ kind: 'merge', issue: issue.number, pr: prNumber,
    summary: `Verified against ${v.criteria.length} criteria in ${loop.rounds} review round(s). Follow-ups: ${loop.followUps.join('; ') || 'none'}` }, undefined);

  done('pr_open', loop.rounds, findings || loop.followUps[0] || 'clean run');
}

async function createWorktree(issue: Issue): Promise<Worktree> {
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-$/, '');
  const branch = `squad/${issue.number}-${slug}`;
  const path = join(PATHS.worktrees, `${issue.number}`);
  await sh('git', ['fetch', 'origin', 'main']);
  await sh('git', ['worktree', 'add', '-B', branch, path, 'origin/main']);
  console.log(`[pipeline] worktree ${path} branch=${branch}`);
  return { path, branch };
}

const comment = async (issue: Issue, body: string) => {
  await sh('gh', ['issue', 'comment', String(issue.number), '-R', issue.repo, '--body', body]);
};
