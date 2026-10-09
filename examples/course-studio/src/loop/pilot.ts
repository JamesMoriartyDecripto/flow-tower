import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAgentFiles } from '../agents';
import { GATES, LIMITS, type Run } from '../config';
import { fill, renderPrompt } from '../prompts';
import { lastJson, runAgent } from '../run-agent';

interface Attempt { item: string; choice: string; confidence: 'low' | 'medium' | 'high' }
interface Friction { where: string; severity: 'critical' | 'major' | 'minor'; note: string }
interface PilotRun { persona: string; completed: boolean; attempts: Attempt[]; friction: Friction[] }

const PERSONAS = [
  { id: 'novice-pm', ability: 0, vars: { persona_name: 'Novice PM', role: 'PM at a 40-person SaaS company', prior_knowledge: 'ChatGPT for emails, never an API', language_level: 'native', context: '20 minutes a day, often on a laptop between meetings', motivation: 'stop feeling behind', habits: 'skims, skips long videos', access_needs: 'none' } },
  { id: 'esl-pm', ability: 1, vars: { persona_name: 'ESL PM', role: 'PM in a distributed team', prior_knowledge: 'some prompting', language_level: 'CEFR B2', context: 'evenings, reads carefully', motivation: 'lead an AI feature', habits: 'looks up every idiom', access_needs: 'plain language' } },
  { id: 'sr-pm', ability: 2, vars: { persona_name: 'Screen-reader PM', role: 'Senior PM', prior_knowledge: 'experienced with LLM tools', language_level: 'native', context: 'desktop, keyboard only', motivation: 'evaluate the course for the team', habits: 'jumps by headings', access_needs: 'screen reader, accessibility tree only' } },
];

/**
 * Simulated pilot. Personas take the course in parallel in the SCORM Cloud sandbox.
 * This finds friction and broken items before real learners do. It is NOT evidence of
 * learning: results are never reported as learner outcomes, and a human beta still follows.
 */
export async function runPilot(run: Run, launchUrl = join(run.dir, 'package', 'sandbox-url.txt')) {
  const url = (await readFile(launchUrl, 'utf8').catch(() => '')).trim();
  const keys = JSON.parse(await readFile(join(run.dir, 'assessment/keys/keys.json'), 'utf8')) as Record<string, string>;
  const sim = loadAgentFiles()['learner-simulator'];

  const runs = await Promise.all(PERSONAS.map(async (p, seed) => {
    const def = { ...sim, prompt: fill(sim.prompt, { persona: renderPrompt('learner-persona', { ...p.vars, seed }) }) };
    const r = await runAgent(def, `Take the course at ${url}. Return your JSON report.`, { run, ...LIMITS.pilot, label: `pilot-${p.id}` });
    return { ability: p.ability, costUsd: r.costUsd, data: r.ok ? lastJson<PilotRun>(r.text) : { persona: p.id, completed: false, attempts: [], friction: [] } };
  }));

  // Classical item analysis on simulated responses: difficulty p and a crude discrimination.
  const items = Object.keys(keys);
  const stats = items.map((item) => {
    const answers = runs.map((r) => ({ ability: r.ability, correct: r.data.attempts.find((a) => a.item === item)?.choice === keys[item] }));
    const p = answers.filter((a) => a.correct).length / Math.max(answers.length, 1);
    const high = answers.filter((a) => a.ability === 2 && a.correct).length;
    const low = answers.filter((a) => a.ability === 0 && a.correct).length;
    return { item, p, discrimination: high - low };
  });
  const weakItems = stats.filter((s) => s.p < GATES.pilot.p_min || s.p > GATES.pilot.p_max || s.discrimination < 0);
  const friction = runs.flatMap((r) => r.data.friction.map((f) => ({ ...f, persona: r.data.persona })));
  const critical = friction.filter((f) => f.severity === 'critical');
  const allCompleted = runs.every((r) => r.data.completed);

  const ok = allCompleted && critical.length <= GATES.pilot.max_critical_friction && weakItems.length === 0;
  const report = [
    `Pilot (simulated, ${runs.length} personas): ${ok ? 'pass' : 'fail'}. completed=${allCompleted}`,
    `Weak items: ${weakItems.map((w) => `${w.item} p=${w.p.toFixed(2)}`).join(', ') || 'none'}`,
    `Critical friction: ${critical.map((f) => `${f.where} (${f.persona}): ${f.note}`).join(' | ') || 'none'}`,
  ].join('\n');
  return { ok, report, stats, friction, costUsd: runs.reduce((s, r) => s + r.costUsd, 0) };
}
