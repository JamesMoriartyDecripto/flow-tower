import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const run = promisify(execFile);
const REPO = env.FORGE_REPO ?? 'forge-studio/emberwake';

export const APPROVAL_KINDS = ['greenlight', 'art_direction', 'milestone_review', 'release_go_no_go'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

const LABEL: Record<ApprovalKind, string> = {
  greenlight: 'forge:greenlight',
  art_direction: 'forge:art-signoff',
  milestone_review: 'forge:milestone',
  release_go_no_go: 'forge:go-no-go',
};

/** Opens a GitHub issue for the decision and pings the studio Slack channel. */
async function openTicket(kind: ApprovalKind, summary: string): Promise<number> {
  const { stdout } = await run('gh', ['issue', 'create', '-R', REPO, '--label', LABEL[kind],
    '--title', `[${kind}] human decision needed`,
    '--body', `${summary}\n\nApprove with the \`forge:approved\` label, or comment \`/forge reject <notes>\`.`]);
  const number = Number(stdout.trim().split('/').pop());
  if (env.FORGE_SLACK_WEBHOOK) {
    await fetch(env.FORGE_SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `:hammer: Forge needs a *${kind}* decision: https://github.com/${REPO}/issues/${number}` }),
    }).catch(() => undefined);
  }
  return number;
}

/**
 * Human checkpoint as a tool. Returns immediately with a ticket: agents never wait
 * holding tokens. The pipeline (not the agent) blocks on awaitApproval().
 */
export const requestApproval = tool(
  'request_approval',
  'Ask a human to decide at a studio checkpoint (greenlight, art_direction, milestone_review, release_go_no_go). ' +
    'Returns a ticket immediately; stop working after calling it. Never use it to bypass a failing gate.',
  {
    kind: z.enum(APPROVAL_KINDS),
    summary: z.string().min(40).max(4_000).describe('What is being decided, evidence (links, scores, gate table), risks, cost so far'),
  },
  async ({ kind, summary }) => {
    const number = await openTicket(kind, summary);
    return { content: [{ type: 'text', text: `Approval requested (${kind}): ${REPO}#${number}. Stop here; the producer resumes when a human answers.` }] };
  },
  { annotations: { openWorldHint: true } },
);

/** Pipeline-side wait. Polls the ticket every minute; 72h without an answer counts as "no". */
export async function awaitApproval(kind: ApprovalKind, summary: string): Promise<{ approved: boolean; notes: string }> {
  const number = await openTicket(kind, summary);
  const deadline = Date.now() + 72 * 3600_000;
  while (Date.now() < deadline) {
    const { stdout } = await run('gh', ['issue', 'view', String(number), '-R', REPO, '--json', 'labels,comments']);
    const issue = JSON.parse(stdout) as { labels: { name: string }[]; comments: { body: string }[] };
    if (issue.labels.some((l) => l.name === 'forge:approved')) return { approved: true, notes: lastNotes(issue.comments) };
    const reject = issue.comments.map((c) => c.body).reverse().find((b) => b.startsWith('/forge reject'));
    if (reject) return { approved: false, notes: reject.replace('/forge reject', '').trim() };
    await sleep(60_000);
  }
  return { approved: false, notes: 'timed out after 72h without a decision' };
}

const lastNotes = (comments: { body: string }[]) => comments.at(-1)?.body.slice(0, 1_000) ?? '';
