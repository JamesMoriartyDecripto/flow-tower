import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Run } from '../config';

export type Checkpoint = 'sme_interview' | 'outline' | 'content' | 'escalation' | 'publish';
interface Person { name: string; email: string }
interface Decision { approved: boolean; comment: string; by: string; at: string }

const NOTION = 'https://api.notion.com/v1';
const headers = () => ({ Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' });

/** Creates a sign-off task on the production board. The reviewer approves by setting Status. */
async function createTask(run: Run, checkpoint: Checkpoint, who: Person, body: string): Promise<string> {
  const res = await fetch(`${NOTION}/pages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_SIGNOFF_DB },
      properties: {
        Name: { title: [{ text: { content: `[${run.slug}] ${checkpoint} sign-off` } }] },
        Reviewer: { email: who.email },
        Status: { status: { name: 'Waiting' } },
      },
      children: [{ paragraph: { rich_text: [{ text: { content: body.slice(0, 1900) } }] } }],
    }),
  });
  const page = (await res.json()) as { id: string; url: string };
  await appendFile(join(run.dir, 'signoffs.log'), `${new Date().toISOString()} ${checkpoint} -> ${who.email} ${page.url}\n`);
  return page.id;
}

/** Human checkpoint: create the task, then poll until approved or returned. Days, not seconds. */
export async function waitForSignoff(run: Run, checkpoint: Checkpoint, who: Person, body = ''): Promise<Decision> {
  const id = await createTask(run, checkpoint, who, body || `Please review ${checkpoint} for ${run.slug}.`);
  for (;;) {
    const page = await fetch(`${NOTION}/pages/${id}`, { headers: headers() }).then((r) => r.json()) as {
      properties: { Status: { status: { name: string } }; Comment?: { rich_text: Array<{ plain_text: string }> } };
    };
    const status = page.properties.Status.status.name;
    const comment = page.properties.Comment?.rich_text.map((t) => t.plain_text).join('') ?? '';
    if (status === 'Approved' || status === 'Changes requested') {
      return { approved: status === 'Approved', comment, by: who.email, at: new Date().toISOString() };
    }
    await new Promise((r) => setTimeout(r, 10 * 60_000));
  }
}

/**
 * Tool for the director: request a sign-off and return immediately. The pipeline (not the
 * model) waits for the decision and resumes the director's session with the answer.
 */
export const requestSignoff = tool(
  'request_signoff',
  'Ask a human to sign off a checkpoint (sme_interview, outline, content, escalation, publish). Returns immediately; ' +
    'end your turn with status "awaiting_signoff". Never assume approval.',
  { checkpoint: z.enum(['sme_interview', 'outline', 'content', 'escalation', 'publish']), summary: z.string().max(1800), questions: z.array(z.string()).max(5).default([]) },
  async ({ checkpoint, summary, questions }) => {
    const run = { slug: env.FORGE_RUN ?? 'interactive', dir: join(env.FORGE_RUNS_DIR ?? 'runs', env.FORGE_RUN ?? 'interactive'), startedAt: '' };
    const body = [summary, ...questions.map((q, i) => `${i + 1}. ${q}`)].join('\n');
    await appendFile(join(run.dir, 'pending-signoffs.jsonl'), JSON.stringify({ checkpoint, body, at: new Date().toISOString() }) + '\n');
    return { content: [{ type: 'text' as const, text: `Sign-off "${checkpoint}" requested. Stop here and report awaiting_signoff.` }] };
  },
);

export async function postQuestions(brief: { owner: Person; topic: string }, questions: string[]): Promise<string> {
  const run = { slug: 'intake', dir: env.FORGE_RUNS_DIR ?? 'runs', startedAt: '' };
  await createTask(run, 'outline', brief.owner, `Before we can start "${brief.topic}":\n${questions.map((q) => `- ${q}`).join('\n')}`);
  return `Asked ${brief.owner.email} ${questions.length} question(s).`;
}

/** SubagentStop: status + cost on the tracker card (best effort, never blocks the agent). */
export async function updateTrackerCard(run: Run, input: unknown): Promise<void> {
  const { agent_type, agent_id } = input as { agent_type?: string; agent_id?: string };
  await appendFile(join(run.dir, 'tracker.log'), `${new Date().toISOString()} ${agent_type ?? 'agent'} ${agent_id ?? ''} stopped\n`).catch(() => undefined);
}
