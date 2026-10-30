import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { PLAN_GATE } from './approval-policy';
import { type Decision, type IssueComment, hasPushAccess, selectDecision } from './approval-select';

const sh = promisify(execFile);

interface ApprovalIssue {
  repo: string;
  number: number;
}
const POLL_MS = 2 * 60_000;

/** `notes` on an approval: approved with changes, e.g. parts moved out of scope to follow-up issues. */
export type Answer = Decision | { kind: 'timeout' };

export interface ApprovalDeps {
  /** Runs `gh` with the given args and returns stdout. Injected so tests never touch the network. */
  gh: (args: string[]) => Promise<string>;
  wait: (ms: number) => Promise<unknown>;
  now: () => number;
}

const defaultDeps: ApprovalDeps = {
  gh: async (args) => (await sh('gh', args)).stdout,
  wait: (ms) => sleep(ms),
  now: () => Date.now(),
};

/**
 * Plan sign-off. The lead asked with request_approval and ended its session, so no
 * agent holds tokens while a human decides. Polls the issue for the `squad:approved`
 * label (managed by repo writers) or a `/squad approve <notes>` / `/squad revise <notes>`
 * comment newer than the request, until PLAN_GATE.approvalTimeoutMin.
 *
 * Comments come from the REST API: the `issue view` JSON does not carry a reliable author
 * association. A command only counts when its author holds push permission on the repo.
 * Any lookup error fails closed (treated as no access). A webhook could replace the polling;
 * this keeps the container the only moving part.
 */
export async function awaitApproval(issue: ApprovalIssue, since: Date, deps: ApprovalDeps = defaultDeps): Promise<Answer> {
  const deadline = since.getTime() + PLAN_GATE.approvalTimeoutMin * 60_000;
  const repoPath = `repos/${issue.repo}`;
  const canPush = async (login: string) => hasPushAccess(JSON.parse(await deps.gh(['api', `${repoPath}/collaborators/${login}/permission`])));
  while (deps.now() < deadline) {
    const [labelsJson, pages] = await Promise.all([
      deps.gh(['issue', 'view', String(issue.number), '-R', issue.repo, '--json', 'labels']),
      deps.gh(['api', `${repoPath}/issues/${issue.number}/comments`, '--paginate', '--slurp']),
    ]);
    const labels = (JSON.parse(labelsJson) as { labels: { name: string }[] }).labels;
    if (labels.some((l) => l.name === 'squad:approved')) return { kind: 'approved' };
    // --slurp wraps each page in an array; flatten to one list of comments.
    const comments = (JSON.parse(pages) as IssueComment[][]).flat();
    const decision = await selectDecision(comments, since, canPush);
    if (decision) return decision;
    await deps.wait(POLL_MS);
  }
  return { kind: 'timeout' };
}
