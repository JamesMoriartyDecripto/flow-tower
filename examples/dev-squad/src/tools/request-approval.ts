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
 * The tool only asks, so no agent ever waits holding tokens. For a plan, the lead then ends its
 * session with status `awaiting_approval`; the pipeline polls the issue (src/loop/await-approval.ts)
 * and resumes the lead with the answer. For a merge, the human merges: nothing resumes.
 */
export const requestApproval = (cwd: string) => tool(
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

    await run('gh', [target[0], 'edit', target[1], '--add-label', label], { cwd });
    await run('gh', [target[0], 'comment', target[1], '--body',
      `### Dev Squad needs a human ${kind} approval\n\n${summary}\n\n` +
      `Approve with the \`squad:approved\` label, approve with changes with \`/squad approve <notes>\`, or ask for a new plan with \`/squad revise <notes>\`. cc ${MAINTAINERS.join(' ')}`], { cwd });
    if (kind === 'merge' && pr) {
      await run('gh', ['pr', 'edit', String(pr), '--add-reviewer', MAINTAINERS[0].slice(1)], { cwd });
    }

    return {
      content: [{
        type: 'text',
        text: `Approval requested (${kind}) on ${target.join(' #')}. Ticket: ${label}. ` +
          (kind === 'plan'
            ? 'Stop here and return your report with status "awaiting_approval"; the pipeline resumes this session with the answer.'
            : 'A maintainer reviews and merges the draft PR.'),
      }],
    };
  },
  { annotations: { openWorldHint: true } },
);
