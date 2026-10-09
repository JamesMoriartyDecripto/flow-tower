import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { parse } from 'yaml';
import { z } from 'zod';
import { runPipeline } from './pipeline';

/** The sponsor's brief, posted by the intake form (Cloudflare Worker) or passed as a file. */
export const BriefSchema = z.object({
  topic: z.string().min(5),
  audience: z.object({
    role: z.string(),
    prior_knowledge: z.string(),
    constraints: z.string().optional(),
  }),
  outcomes: z.array(z.string()).min(3).max(10),
  modules: z.number().int().min(3).max(10).optional(),
  minutes_per_module: z.number().int().default(120),
  locales: z.array(z.string()).default(['en']),
  sme: z.object({ name: z.string(), email: z.string().email(), accreditation: z.string().optional() }).optional(),
  owner: z.object({ name: z.string(), email: z.string().email() }),
  lms: z.object({ target: z.enum(['moodle', 'canvas']), standard: z.enum(['scorm2004-4th', 'scorm12', 'cmi5']) }),
  deadline: z.string(),
  budget_usd: z.number().positive().max(200),
});
export type Brief = z.infer<typeof BriefSchema>;

/**
 * Usage: npx tsx src/main.ts samples/brief.yaml
 * Long-running: the pipeline pauses at each human checkpoint and resumes when the
 * sign-off arrives (request_signoff polls Notion; see src/tools/request-signoff.ts).
 */
async function main() {
  const file = argv[2];
  if (!file) {
    console.error('usage: main.ts <brief.yaml>');
    exit(2);
  }
  const brief = BriefSchema.parse(parse(readFileSync(file, 'utf8')));
  const outcome = await runPipeline(brief);
  console.log(JSON.stringify(outcome, null, 2));
  exit(outcome.status === 'live' ? 0 : 1);
}

main().catch((err) => {
  console.error('[forge] fatal:', err instanceof Error ? err.message : err);
  exit(1);
});
