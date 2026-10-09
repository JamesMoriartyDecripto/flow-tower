import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const run = promisify(execFile);
const MAINTAINERS = ['@org/maintainers'];

/**
 * Human-in-the-loop checkpoint. Used twice:
 *  - kind "plan":  high-risk or large plans, BEFORE any code is written;
 *  - kind "merge": the verified draft PR, BEFORE anything reaches main.
 * The tool only asks. The pipeline polls the label/review state and resumes
 * the session when a human answers, so no agent ever waits holding tokens.
 */
export const requestApproval = tool(
  'request_approval',
  'Ask a human maintainer to approve a plan or a pull request. Returns immediately with a ticket; ' +
    'stop working after calling it. Never call it to bypass a failing check.',
  {
    kind: z.enum(['plan', 'merge']),
    issue: z.number().int().positive(),
    pr: z.number().int().positive().optional(),
    summary: z.string().min(20).max(2_000).describe('What the human is approving, risks, and how to roll back'),
  },
  async ({ kind, issue, pr, summary }) => {
    const label = kind === 'plan' ? 'squad:plan-review' : 'squad:merge-review';
    const target = kind === 'merge' && pr ? ['pr', String(pr)] : ['issue', String(issue)];

    await run('gh', [target[0], 'edit', target[1], '--add-label', label]);
    await run('gh', [target[0], 'comment', target[1], '--body',
      `### Dev Squad needs a human ${kind} approval\n\n${summary}\n\n` +
      `Approve with the \`squad:approved\` label, or comment \`/squad revise <notes>\`. cc ${MAINTAINERS.join(' ')}`]);
    if (kind === 'merge' && pr) {
      await run('gh', ['pr', 'edit', String(pr), '--add-reviewer', MAINTAINERS[0].slice(1)]);
    }

    return {
      content: [{
        type: 'text',
        text: `Approval requested (${kind}) on ${target.join(' #')}. Ticket: ${label}. ` +
          'Stop here; the pipeline resumes this session when a human responds.',
      }],
    };
  },
  { annotations: { openWorldHint: true } },
);
