import { loadAgentFiles } from '../agents';
import { CONCURRENCY, LIMITS, MODELS, REVIEW, type Run } from '../config';
import type { Intake } from '../intake';
import { renderPrompt } from '../prompts';
import { runAgent } from '../run-agent';

export interface ModuleResult { module: number; status: 'done' | 'blocked'; report: string; costUsd: number }

/**
 * Parallelization (sectioning). One module writer per module, each in an isolated
 * session with only its spec + research pack. A small pool keeps concurrency at 3 so
 * rate limits and the budget stay predictable. A blocked module is retried once.
 *
 * Also used for revision rounds: pass `briefs` (module -> revision brief) and `round`.
 */
export async function writeModules(
  run: Run, intake: Intake, opts: { briefs?: Map<number, string>; round?: number } = {},
) {
  const modules = opts.briefs ? [...opts.briefs.keys()] : Array.from({ length: intake.modules }, (_, i) => i + 1);
  const round = opts.round ?? 0;
  // Cheap first, smart when stuck: the revision before the final review round runs on Opus.
  const model = round + 1 >= REVIEW.escalateToOpusOnRound ? MODELS.opus : undefined;

  const one = async (module: number, attempt = 1): Promise<ModuleResult> => {
    const writer = loadAgentFiles({ audience: intake.audience, module: String(module) })['module-writer'];
    const task = opts.briefs
      ? renderPrompt('revise-round', {
          round,
          module,
          course_title: intake.title,
          findings: opts.briefs.get(module)!,
          non_blocking: 'see backlog; ignore this round',
        })
      : `Write all lessons of module ${module} from design/outline.md. Research pack: research/m${module}.md.`;
    const r = await runAgent(writer, task, { run, ...LIMITS.writer, model, label: `writer-m${module}` });
    const status = /STATUS:\s*done/i.test(r.text) && r.ok ? 'done' : 'blocked';
    if (status === 'blocked' && attempt < 2) {
      const retry = await one(module, attempt + 1);
      return { ...retry, costUsd: retry.costUsd + r.costUsd };
    }
    return { module, status, report: r.text.slice(-1200), costUsd: r.costUsd };
  };

  const results = await pool(modules, CONCURRENCY.modules, (m) => one(m));
  const blocked = results.filter((r) => r.status === 'blocked').map((r) => r.module);
  return {
    results,
    blocked,
    costUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
    summary: results.map((r) => `m${r.module}: ${r.status}`).join(', '),
  };
}

/** Minimal promise pool: at most `size` tasks in flight, results in input order. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}
