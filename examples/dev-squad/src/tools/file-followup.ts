import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const run = promisify(execFile);

/**
 * Follow-up issues for work the maintainer moved out of scope at the plan sign-off
 * ("/squad approve <notes>"). The lead files them instead of silently dropping or
 * silently doing them; each links back to the issue it came from.
 */
export const fileFollowup = (cwd: string) => tool(
  'file_followup',
  'Open a follow-up GitHub issue for a part of the plan the maintainer moved out of scope. ' +
    'Only for items named in the approval notes; never to defer work that is in scope.',
  {
    issue: z.number().int().positive().describe('The issue being delivered'),
    title: z.string().min(10).max(90),
    body: z.string().min(20).max(4_000).describe('What is left to do and why it was moved out'),
  },
  async ({ issue, title, body }) => {
    // argv array, no shell: title and body can contain anything without injection risk.
    const { stdout } = await run('gh', ['issue', 'create', '--title', title, '--label', 'squad:followup',
      '--body', `${body}\n\nMoved out of #${issue} at its plan sign-off.`], { cwd });
    return { content: [{ type: 'text', text: `Follow-up opened: ${stdout.trim()}` }] };
  },
  { annotations: { openWorldHint: true } },
);
