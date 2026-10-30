import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { PLAN_GATE } from './approval-policy';
import {
  APPROVED_LABEL,
  type Decision,
  type IssueComment,
  type LabelEvent,
  hasPushAccess,
  selectCommentDecision,
  selectLabelDecision,
} from './approval-select';

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
 * agent holds tokens while a human decides. Polls the issue until PLAN_GATE.approvalTimeoutMin.
 * A `/squad approve <notes>` / `/squad revise <notes>` comment newer than the request counts when
 * its author holds push permission. The `squad:approved` label counts only while it is on the issue
 * and its newest labeled/unlabeled event is a fresh `labeled` by a pusher. The newer of the two wins,
 * so a later revise is never bypassed by an older label.
 *
 * Comments come from the REST API: the `issue view` JSON does not carry a reliable author
 * association. Any permission lookup error fails closed (treated as no access). Event-read errors
 * make label evidence unavailable, but comments are still read. A webhook could replace the polling;
 * this keeps the container the only moving part.
 */
export async function awaitApproval(issue: ApprovalIssue, since: Date, deps: ApprovalDeps = defaultDeps): Promise<Answer> {
  const deadline = since.getTime() + PLAN_GATE.approvalTimeoutMin * 60_000;
  const repoPath = `repos/${issue.repo}`;
  const canPushRaw = async (login: string) => hasPushAccess(JSON.parse(await deps.gh(['api', `${repoPath}/collaborators/${login}/permission`])));
  while (deps.now() < deadline) {
    // One permission lookup per actor for this poll, shared by comments and label events.
    const verdicts = new Map<string, Promise<boolean>>();
    const canPush = (login: string) => {
      if (!verdicts.has(login)) verdicts.set(login, canPushRaw(login).catch(() => false));
      return verdicts.get(login)!;
    };
    const [labelsJson, pages] = await Promise.all([
      deps.gh(['issue', 'view', String(issue.number), '-R', issue.repo, '--json', 'labels']),
      deps.gh(['api', `${repoPath}/issues/${issue.number}/comments`, '--paginate', '--slurp']),
    ]);
    const labels = (JSON.parse(labelsJson) as { labels: { name: string }[] }).labels;
    const labelPresent = labels.some((l) => l.name === APPROVED_LABEL);
    // --slurp wraps each page in an array; flatten to one list of comments.
    const comments = (JSON.parse(pages) as IssueComment[][]).flat();
    const [commentHit, labelHit] = await Promise.all([
      selectCommentDecision(comments, since, canPush),
      labelPresent ? labelEvidence(issue, repoPath, since, canPush, deps.gh) : undefined,
    ]);
    if (labelHit && (!commentHit || labelHit.at > commentHit.at)) return labelHit.decision;
    if (commentHit) return commentHit.decision;
    await deps.wait(POLL_MS);
  }
  return { kind: 'timeout' };
}

/**
 * Reads the issue's label events only when the label is on the issue. A failed or malformed read
 * means no label evidence this poll, not an error: valid comments and the timeout still apply.
 */
async function labelEvidence(
  issue: ApprovalIssue,
  repoPath: string,
  since: Date,
  canPush: (login: string) => Promise<boolean>,
  gh: ApprovalDeps['gh'],
) {
  try {
    const pages = await gh(['api', `${repoPath}/issues/${issue.number}/events`, '--paginate', '--slurp']);
    const events = (JSON.parse(pages) as LabelEvent[][]).flat();
    return await selectLabelDecision(events, since, canPush);
  } catch {
    return undefined;
  }
}
