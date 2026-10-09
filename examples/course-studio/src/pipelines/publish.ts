import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAgentFiles } from '../agents';
import { LIMITS, type Run } from '../config';
import type { Brief } from '../main';
import { lastJson, runAgent } from '../run-agent';
import { setCourseVisible } from '../tools/lms-upload';
import { waitForSignoff } from '../tools/request-signoff';

interface PackagerReport {
  package: string;
  sha256: string;
  manifest_valid: boolean;
  smoke: { launch: boolean; completion_reported: boolean; success_reported: boolean; score_reported: boolean };
  sandbox_url: string;
  lms_course_id: number;
}

/**
 * Package -> conformance test -> human approval -> visible. The packager agent prepares a
 * HIDDEN course; only this code, after the owner approves, flips it to visible. No agent
 * holds a tool that can make a course public.
 */
export async function publishCourse(run: Run, brief: Brief) {
  const packager = loadAgentFiles()['course-packager'];
  const r = await runAgent(
    packager,
    `Package the course for ${brief.lms.target} as ${brief.lms.standard}. Run the SCORM Cloud smoke test. ` +
      'Prepare the LMS course hidden. Return your JSON report.',
    { run, ...LIMITS.packager, label: 'packager' },
  );
  if (!r.ok) return { live: false, costUsd: r.costUsd, notes: `packager stopped: ${r.text}` };

  const report = lastJson<PackagerReport>(r.text);
  const smokeOk = report.manifest_valid && Object.values(report.smoke).every(Boolean);
  if (!smokeOk) return { live: false, costUsd: r.costUsd, notes: `conformance failed: ${JSON.stringify(report.smoke)}` };

  const launchKit = await readFile(join(run.dir, 'marketing/landing.md'), 'utf8').catch(() => '(missing landing page)');
  const approval = await waitForSignoff(run, 'publish', brief.owner, [
    `Sandbox: ${report.sandbox_url}`,
    `Package: ${report.package} (sha256 ${report.sha256.slice(0, 12)})`,
    `Review + pilot reports: ${run.dir}/review-round-*.json, pilot report in tracker`,
    `Landing page preview:\n${launchKit.slice(0, 1500)}`,
  ].join('\n'));
  if (!approval.approved) return { live: false, costUsd: r.costUsd, notes: `publish declined: ${approval.comment}` };

  const url = await setCourseVisible(report.lms_course_id);
  return { live: true, costUsd: r.costUsd, notes: `live at ${url}` };
}
