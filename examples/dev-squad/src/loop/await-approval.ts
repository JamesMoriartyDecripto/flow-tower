import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { PLAN_GATE } from '../config';
import type { Issue } from '../main';

const sh = promisify(execFile);
const POLL_MS = 2 * 60_000;

/** `notes` on an approval: approved with changes, e.g. parts moved out of scope to follow-up issues. */
export type Answer = { kind: 'approved'; notes?: string } | { kind: 'revise'; notes: string } | { kind: 'timeout' };

/**
 * Plan sign-off. The lead asked with request_approval and ended its session, so no
 * agent holds tokens while a human decides. Polls the issue for the `squad:approved`
 * label, a `/squad approve <notes>` comment (approved with changes) or a `/squad revise <notes>`
 * comment newer than the request, until
 * PLAN_GATE.approvalTimeoutMin. A webhook could replace the polling; this keeps the
 * container the only moving part.
 */
export async function awaitApproval(issue: Issue, since: Date): Promise<Answer> {
  const deadline = since.getTime() + PLAN_GATE.approvalTimeoutMin * 60_000;
  while (Date.now() < deadline) {
    const { stdout } = await sh('gh', ['issue', 'view', String(issue.number), '-R', issue.repo, '--json', 'labels,comments']);
    const state = JSON.parse(stdout) as { labels: { name: string }[]; comments: { body: string; createdAt: string }[] };
    if (state.labels.some((l) => l.name === 'squad:approved')) return { kind: 'approved' };
    const command = state.comments.findLast((c) => new Date(c.createdAt) > since && /^\/squad (approve|revise)\b/.test(c.body.trim()));
    if (command) {
      const [, verb, notes] = /^\/squad (approve|revise)\b\s*([\s\S]*)$/.exec(command.body.trim())!;
      return verb === 'approve' ? { kind: 'approved', ...(notes.trim() && { notes: notes.trim() }) } : { kind: 'revise', notes: notes.trim() };
    }
    await sleep(POLL_MS);
  }
  return { kind: 'timeout' };
}
