import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Client checkpoint. Posts the artifact (sitemap, Figma link, preview URL) to the client's
 * Slack Connect channel and the Linear project, then returns at once: the pipeline resumes
 * when the client answers. Rounds are counted here so a fourth round becomes a change request.
 */
const MAX_ROUNDS = { sitemap: 2, wireframes: 2, design: 3, preview: 3 } as const;

export const requestSignoff = tool(
  'request_signoff',
  'Ask the client to approve a milestone. Stop working after calling it.',
  {
    milestone: z.enum(['sitemap', 'wireframes', 'design', 'preview']),
    round: z.number().int().min(1),
    artifactUrl: z.url(),
    summary: z.string().min(20).max(1500).describe('What changed since the last round and what exactly to approve'),
  },
  async ({ milestone, round, artifactUrl, summary }) => {
    if (round > MAX_ROUNDS[milestone]) {
      return { content: [{ type: 'text', text: `Round ${round} exceeds the ${MAX_ROUNDS[milestone]} included rounds: open a change request instead.` }], isError: true };
    }
    await fetch('https://studio.example.com/api/signoffs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ milestone, round, artifactUrl, summary, timeout: '5d' }),
    });
    return { content: [{ type: 'text', text: `Sign-off requested: ${milestone} round ${round}. Waiting for the client.` }] };
  },
);
