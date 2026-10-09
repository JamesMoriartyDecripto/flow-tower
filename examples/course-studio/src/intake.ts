import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { LIMITS, ROLE_MODEL, sdkEnv } from './config';
import type { Brief } from './main';
import { renderPrompt, untrusted } from './prompts';

export const IntakeSchema = z.object({
  route: z.enum(['new', 'refresh', 'needs_info', 'decline']),
  title: z.string(),
  audience: z.string(),
  modules: z.number().int().min(3).max(10),
  complexity: z.number().int().min(1).max(5),
  freshness_months: z.number().int().min(3).max(60),
  locales: z.array(z.string()).min(1),
  risk_flags: z.array(z.enum(['regulated', 'fast_moving', 'minors', 'third_party_ip', 'localization'])),
  questions: z.array(z.string()).max(5),
  reason: z.string(),
});
export type Intake = z.infer<typeof IntakeSchema>;

/**
 * Routing. One cheap, tool-less Haiku call with a JSON schema output decides how much
 * machinery a brief deserves. Deterministic policy then overrides the model where the
 * cost of a wrong answer is high (regulated topics, missing SME).
 */
export async function runIntake(brief: Brief): Promise<Intake> {
  const stream = query({
    prompt: renderPrompt('intake', { brief: untrusted(JSON.stringify(brief, null, 2), 'brief') }),
    options: {
      model: ROLE_MODEL.intake,
      tools: [],
      settingSources: [], // no CLAUDE.md: the router needs nothing but the brief
      maxTurns: LIMITS.intake.maxTurns,
      maxBudgetUsd: LIMITS.intake.maxBudgetUsd,
      outputFormat: { type: 'json_schema', schema: z.toJSONSchema(IntakeSchema) },
      env: sdkEnv(),
    },
  });

  let raw: unknown;
  for await (const msg of stream) {
    if (msg.type === 'result' && msg.subtype === 'success') raw = msg.structured_output;
  }
  return applyPolicy(IntakeSchema.parse(raw), brief);
}

/** The model proposes, policy disposes. */
function applyPolicy(intake: Intake, brief: Brief): Intake {
  if (!brief.sme?.name || !brief.sme?.email) {
    return { ...intake, route: 'needs_info', questions: ['Who is the subject-matter expert who will sign off the content?'] };
  }
  if (intake.risk_flags.includes('regulated') && !brief.sme.accreditation) {
    return { ...intake, route: 'decline', reason: 'Regulated topic without an accredited SME.' };
  }
  if (brief.locales.length > 1 && !intake.risk_flags.includes('localization')) {
    intake.risk_flags.push('localization');
  }
  return { ...intake, modules: brief.modules ?? intake.modules };
}
