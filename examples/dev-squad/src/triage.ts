import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { LIMITS, ROLE_MODEL, sdkEnv } from './config';
import { renderPrompt, untrusted } from './prompts';
import type { Issue } from './main';

/** Routing pattern: one cheap classification decides how much machinery an issue gets. */
export const TriageSchema = z.object({
  kind: z.enum(['bug', 'feature', 'chore', 'docs', 'question']),
  complexity: z.number().int().min(1).max(5),
  route: z.enum(['quickfix', 'full', 'needs_info', 'reject']),
  risk: z.enum(['low', 'medium', 'high']),
  areas: z.array(z.string()).max(5),
  questions: z.array(z.string()).describe('What to ask the reporter when route=needs_info'),
  rationale: z.string().max(400),
});
export type Triage = z.infer<typeof TriageSchema>;

export async function triage(issue: Issue, openIssueTitles: string[]): Promise<Triage> {
  const prompt = renderPrompt('triage', {
    repo: issue.repo,
    issue_number: issue.number,
    issue_title: issue.title,
    issue_labels: issue.labels.join(', ') || 'none',
    issue_body: untrusted(issue.body),
    open_issue_titles: openIssueTitles.slice(0, 30).join(' | '),
  });

  const run = query({
    prompt,
    options: {
      model: ROLE_MODEL.triage.model,
      tools: [], // pure classification: no tools, nothing to misuse
      settingSources: [], // no CLAUDE.md, no project hooks: keep it cheap and deterministic
      outputFormat: { type: 'json_schema', schema: z.toJSONSchema(TriageSchema) },
      ...LIMITS.triage,
      env: sdkEnv(),
    },
  });

  for await (const msg of run) {
    if (msg.type !== 'result') continue;
    if (msg.subtype !== 'success') throw new Error(`triage failed: ${msg.subtype}`);
    const parsed = TriageSchema.safeParse(msg.structured_output);
    if (parsed.success) {
      const t = applyPolicy(parsed.data, issue);
      console.log(`[triage] issue=#${issue.number} kind=${t.kind} complexity=${t.complexity} risk=${t.risk} areas=[${t.areas.join(', ')}] route=${t.route} cost_usd=${msg.total_cost_usd.toFixed(2)}`);
      return t;
    }
    throw new Error(`triage returned invalid JSON: ${parsed.error.message}`);
  }
  throw new Error('triage produced no result');
}

/** Deterministic overrides: code, not the model, has the last word on safety. */
function applyPolicy(t: Triage, issue: Issue): Triage {
  // Opting out wins over everything, including the upgrade below.
  if (issue.labels.includes('squad:skip')) return { ...t, route: 'reject', rationale: 'Opted out via label.' };
  // Personal data counts as sensitive too: a journal of what users say is as risky as billing code.
  const sensitive = /auth|billing|payment|migration|permission|secret|privacy|personal|pii|gdpr/i;
  const touchesSensitive = sensitive.test(`${issue.title} ${t.areas.join(' ')}`);
  if (t.route === 'quickfix' && (t.complexity > 2 || touchesSensitive)) {
    return { ...t, route: 'full', risk: 'high', rationale: `${t.rationale} [policy: upgraded to full]` };
  }
  // On the full route too: a sensitive area always gets a human plan sign-off (risk high).
  if (t.route === 'full' && touchesSensitive && t.risk !== 'high') {
    return { ...t, risk: 'high', rationale: `${t.rationale} [policy: sensitive area, risk high]` };
  }
  return t;
}
