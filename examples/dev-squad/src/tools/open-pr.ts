import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { PROTECTED_BRANCHES } from '../config';

const run = promisify(execFile);
const CONVENTIONAL = /^(feat|fix|docs|refactor|perf|test|chore|build|ci)(\([\w-]+\))?!?: .{3,70}$/;

/**
 * Opens a DRAFT pull request. Drafts cannot be merged by accident, and the agent
 * has no merge tool at all: promotion to "ready" and the merge stay human.
 * Bound to the issue worktree: an in-process tool runs in the pipeline's process, so process.cwd() is not the worktree.
 */
export const openPr = (cwd: string) => tool(
  'open_pr',
  'Push the current issue branch and open a DRAFT pull request against main. ' +
    'Call only after the verifier returned "ship". Returns the PR URL.',
  {
    title: z.string().regex(CONVENTIONAL, 'Use a conventional commit title, max 70 chars'),
    issue: z.number().int().positive(),
    bodyFile: z.string().default('.squad/pr-body.md'),
    labels: z.array(z.string()).max(5).default(['dev-squad']),
  },
  async ({ title, issue, bodyFile, labels }) => {
    const { stdout: branch } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    const head = branch.trim();
    if (PROTECTED_BRANCHES.some((b) => new RegExp(`^${b.replace('*', '.*')}$`).test(head))) {
      return { content: [{ type: 'text', text: `Refusing to open a PR from protected branch ${head}.` }], isError: true };
    }

    const body = `${await readFile(resolve(cwd, bodyFile), 'utf8')}\n\nCloses #${issue}\n\n_Opened by Dev Squad. A human must review and merge._`;
    await run('git', ['push', '--set-upstream', 'origin', head], { cwd });
    // argv array, no shell: title and body can contain anything without injection risk.
    const { stdout } = await run(
      'gh',
      ['pr', 'create', '--draft', '--base', 'main', '--head', head, '--title', title, '--body', body,
        ...labels.flatMap((l) => ['--label', l])],
      { cwd },
    );
    return { content: [{ type: 'text', text: stdout.trim() }] };
  },
  { annotations: { destructiveHint: false, openWorldHint: true } },
);
