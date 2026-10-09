import { query } from '@anthropic-ai/claude-agent-sdk';
import { agent, promptAgent } from './agents';
import { LIMITS, ROLE_MODEL, loadConfig, sdkEnv } from './config';
import { compact, renderPrompt, untrusted } from './prompts';
import { lastJson, runAgent } from './run-agent';
import { awaitApproval } from './tools/request-approval';

export interface Intake {
  genre: string;
  scope: 'jam' | 'slice' | 'full';
  risk: 'low' | 'medium' | 'high';
  fit: number; // 0-10 against studio constraints
  red_flags: string[];
}

export interface Greenlight { approved: boolean; intake: Intake; pillars: string[]; scan: string; notes: string; costUsd: number }

const INTAKE_SCHEMA = {
  type: 'object',
  required: ['genre', 'scope', 'risk', 'fit', 'red_flags'],
  properties: {
    genre: { type: 'string' },
    scope: { enum: ['jam', 'slice', 'full'] },
    risk: { enum: ['low', 'medium', 'high'] },
    fit: { type: 'integer', minimum: 0, maximum: 10 },
    red_flags: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Routing step: a tool-less Haiku call with structured output. Cents per pitch. */
async function intake(pitch: string): Promise<{ intake: Intake; costUsd: number }> {
  const constraints = loadConfig<{ studio: unknown }>('platforms').studio;
  const run = query({
    prompt: renderPrompt('pitch-intake', { pitch: untrusted(pitch, 'pitch'), studio_constraints: compact(constraints) }),
    options: {
      model: ROLE_MODEL['pitch-intake'],
      tools: [],
      settingSources: [],
      outputFormat: { type: 'json_schema', schema: INTAKE_SCHEMA },
      env: sdkEnv(),
      ...LIMITS.intake,
    },
  });
  for await (const msg of run) {
    if (msg.type === 'result' && msg.subtype === 'success') {
      return { intake: (msg.structured_output ?? lastJson(msg.result)) as Intake, costUsd: msg.total_cost_usd };
    }
  }
  throw new Error('pitch intake failed');
}

/**
 * Pitch & Greenlight: intake -> (parallel) market quick-scan + creative pillars ->
 * human greenlight. Nothing in production is spent before a person says yes.
 */
export async function greenlight(pitch: string, runId: string, cwd: string): Promise<Greenlight> {
  const { intake: triage, costUsd: intakeCost } = await intake(pitch);
  if (triage.fit < 4 || triage.scope === 'full') {
    return { approved: false, intake: triage, pillars: [], scan: '', notes: `auto-declined: fit=${triage.fit} scope=${triage.scope}`, costUsd: intakeCost };
  }

  const base = { cwd, runId, department: 'greenlight' };
  const director = promptAgent('creative-director', 'Owns vision and pillars', ['Read', 'Write'], {
    pitch: untrusted(pitch, 'pitch'), pillars: 'none yet: propose 3-4', milestone: 'greenlight',
  });

  const [scan, vision] = await Promise.all([
    runAgent(agent('market-analyst'), `Quick scan (max 1 page): comparable titles, price band, wishlist signals for: ${triage.genre}`,
      { ...base, ...LIMITS.specialist, maxBudgetUsd: 1, servers: ['analytics'] }),
    runAgent(director, 'Propose 3-4 design pillars. End with JSON {"pillars": [...]}.', { ...base, ...LIMITS.director }),
  ]);
  const { pillars } = lastJson<{ pillars: string[] }>(vision.text);

  const decision = await awaitApproval('greenlight', [
    `Genre: ${triage.genre} · scope ${triage.scope} · risk ${triage.risk} · fit ${triage.fit}/10`,
    `Pillars: ${pillars.join(' / ')}`,
    `Red flags: ${triage.red_flags.join('; ') || 'none'}`,
    `Market scan:\n${scan.text.slice(0, 2_000)}`,
  ].join('\n'));

  return {
    approved: decision.approved,
    intake: triage,
    pillars,
    scan: scan.text,
    notes: decision.notes,
    costUsd: intakeCost + scan.costUsd + vision.costUsd,
  };
}
