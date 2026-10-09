import { LIMITS, createRun } from './config';
import { runIntake } from './intake';
import { reviewBoard } from './loop/review-board';
import { runPilot } from './loop/pilot';
import type { Brief } from './main';
import { appendSessionLog } from './memory/session-log';
import { runDirector, type DirectorReport } from './orchestrator';
import { writeModules } from './pipelines/modules';
import { publishCourse } from './pipelines/publish';
import { postQuestions, waitForSignoff } from './tools/request-signoff';

export interface Outcome { status: 'live' | 'needs_info' | 'declined' | 'blocked' | 'escalated'; costUsd: number; notes: string }

/**
 * Prompt chaining with gates. Each stage must pass its gate before the next one starts,
 * and three human checkpoints (outline, content, publish) can stop the chain.
 */
export async function runPipeline(brief: Brief): Promise<Outcome> {
  const intake = await runIntake(brief);
  if (intake.route === 'needs_info') return { status: 'needs_info', costUsd: 0, notes: await postQuestions(brief, intake.questions) };
  if (intake.route === 'decline') return { status: 'declined', costUsd: 0, notes: intake.reason };

  const run = createRun(slugify(intake.title));
  let cost = 0;
  const spend = (usd: number) => {
    cost += usd;
    if (cost > LIMITS.courseUsd) throw new Error(`course budget exceeded: $${cost.toFixed(2)}`);
  };
  const done = async (o: Outcome) => (await appendSessionLog(run, intake, o), o);

  // 1-2. Research + learning design, then checkpoint 1 (SME signs off the outline).
  let d: DirectorReport = await runDirector(brief, intake, run, 'research_design', 'Research, then design. Request the outline sign-off.');
  spend(d.costUsd);
  if (d.status === 'blocked') return done({ status: 'blocked', costUsd: cost, notes: d.notes });
  const outline = await waitForSignoff(run, 'outline', brief.sme!);
  if (!outline.approved) return done({ status: 'blocked', costUsd: cost, notes: `SME returned the outline: ${outline.comment}` });

  // 3. Production: code fans out module writers; the director runs media + assessment.
  const modules = await writeModules(run, intake);
  spend(modules.costUsd);
  d = await runDirector(brief, intake, run, 'media_assessment', `Module drafts ready: ${modules.summary}`, d.sessionId);
  spend(d.costUsd);

  // 4. Review board (evaluator-optimizer, max 3 rounds), then checkpoint 2 (SME content review).
  const board = await reviewBoard(run, intake);
  spend(board.costUsd);
  if (board.outcome === 'escalate') {
    const decision = await waitForSignoff(run, 'escalation', brief.sme!, board.report);
    if (!decision.approved) return done({ status: 'escalated', costUsd: cost, notes: board.report });
  }
  const content = await waitForSignoff(run, 'content', brief.sme!, board.report);
  if (!content.approved) return done({ status: 'blocked', costUsd: cost, notes: `SME comments: ${content.comment}` });

  // 5. Pilot with simulated learners. One fix pass only, then publish or stop.
  let pilot = await runPilot(run);
  spend(pilot.costUsd);
  if (!pilot.ok) {
    d = await runDirector(brief, intake, run, 'pilot_fixes', pilot.report, d.sessionId);
    spend(d.costUsd);
    pilot = await runPilot(run);
    spend(pilot.costUsd);
    if (!pilot.ok) return done({ status: 'blocked', costUsd: cost, notes: pilot.report });
  }

  // 6. Package, conformance test, launch kit, then checkpoint 3 (owner approves publish).
  d = await runDirector(brief, intake, run, 'launch', 'Prepare the package and the launch kit.', d.sessionId);
  spend(d.costUsd);
  const published = await publishCourse(run, brief);
  spend(published.costUsd);
  return done({ status: published.live ? 'live' : 'blocked', costUsd: cost, notes: published.notes });
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
