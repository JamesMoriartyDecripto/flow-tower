import { tool } from '@anthropic-ai/claude-agent-sdk';
import { env } from 'node:process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Human gate. Posts a preview with approve / edit / reject buttons to Slack and records a
 * pending approval with its deadline. Returns at once: the Slack interaction handler resumes
 * the pipeline. A sweeper applies on_timeout from config/approval-policy.yaml; for posts that
 * is "reject", so silence never publishes.
 */
const policy = parse(readFileSync('config/approval-policy.yaml', 'utf8'));
type Gate = 'weekly_plan' | 'post' | 'legal' | 'reply' | 'boost';

export const requestApproval = tool(
  'request_approval',
  'Ask a person to approve a plan, post, reply or boost. Stop working after calling it.',
  {
    gate: z.enum(['weekly_plan', 'post', 'legal', 'reply', 'boost']),
    subjectId: z.string().describe('Calendar week, variant id, inbox item id or campaign id'),
    round: z.number().int().min(1),
    summary: z.string().min(20).max(2000),
    previews: z.array(z.object({ platform: z.string(), text: z.string(), mediaUrl: z.url().optional(), aiFlags: z.record(z.string(), z.boolean()).optional() })).default([]),
  },
  async ({ gate, subjectId, round, summary, previews }) => {
    const g = policy.gates[gate as Gate];
    if (g.max_rounds && round > g.max_rounds) {
      return { content: [{ type: 'text', text: `Round ${round} exceeds ${g.max_rounds}: hand back to the social manager.` }], isError: true };
    }
    const approver = policy.approvers[g.approver];
    const deadline = new Date(Date.now() + parseDuration(g.timeout)).toISOString();

    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: `*${gate}* \`${subjectId}\` round ${round} for <${approver.slack}>\n${summary}\n_Due ${deadline}; on timeout: ${g.on_timeout}_` } },
      ...previews.map((p) => ({ type: 'section', text: { type: 'mrkdwn', text: `*${p.platform}*${p.aiFlags ? ` AI flags: ${JSON.stringify(p.aiFlags)}` : ''}\n${p.text}` } })),
      { type: 'actions', elements: ['approve', 'edit', 'reject'].map((a) => ({ type: 'button', action_id: a, value: `${gate}:${subjectId}:${round}`, text: { type: 'plain_text', text: a } })) },
    ];

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: g.channel ?? approver.slack, text: `${gate} approval: ${subjectId}`, blocks }),
    });
    const body = await res.json();
    if (!body.ok) return { content: [{ type: 'text', text: `Slack error: ${body.error}` }], isError: true };

    await fetch(`${env.STUDIO_API}/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gate, subjectId, round, deadline, onTimeout: g.on_timeout, slackTs: body.ts }),
    });
    return { content: [{ type: 'text', text: `Approval requested (${gate}, due ${deadline}). Waiting for a person.` }] };
  },
);

function parseDuration(d: string): number {
  const n = Number.parseInt(d, 10);
  const unit = d.replace(String(n), '');
  return n * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[unit];
}
