import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { env } from 'node:process';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const SCORM_CLOUD = 'https://cloud.scorm.com/api/v2';
const scormAuth = () => 'Basic ' + Buffer.from(`${env.SCORM_CLOUD_APP_ID}:${env.SCORM_CLOUD_SECRET}`).toString('base64');
const MOODLE = env.MOODLE_URL ?? 'https://lms.example.com';

/** Moodle REST web service call (token scoped to a service user with course-create rights only). */
async function moodle<T>(fn: string, params: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams({ wstoken: env.MOODLE_TOKEN ?? '', wsfunction: fn, moodlewsrestformat: 'json' });
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const res = await fetch(`${MOODLE}/webservice/rest/server.php`, { method: 'POST', body });
  const json = await res.json();
  if (json?.exception) throw new Error(`moodle ${fn}: ${json.message}`);
  return json as T;
}

/**
 * Two targets, two risk levels:
 * - scorm-cloud: conformance sandbox. Imports the zip, creates a test registration and returns
 *   a launch link for the smoke test and the simulated pilot.
 * - moodle: creates the course HIDDEN and adds the SCORM activity (site plugin
 *   local_forge, since core has no "create SCORM activity" web service). Never visible.
 */
export const lmsUpload = tool(
  'lms_upload',
  'Upload a SCORM/cmi5 package. target "scorm-cloud" imports into the conformance sandbox and returns a launch URL. ' +
    'target "moodle" creates a HIDDEN course with the package; it can never make a course visible.',
  {
    target: z.enum(['scorm-cloud', 'moodle']),
    package_path: z.string().endsWith('.zip'),
    course_id: z.string().regex(/^[a-z0-9-]{3,48}$/),
    title: z.string().max(120),
    category_id: z.number().int().optional(),
  },
  async ({ target, package_path, course_id, title, category_id }) => {
    const zip = new Blob([await readFile(package_path)], { type: 'application/zip' });

    if (target === 'scorm-cloud') {
      const form = new FormData();
      form.set('file', zip, basename(package_path));
      const job = await fetch(`${SCORM_CLOUD}/courses/importJobs/upload?courseId=${course_id}&mayCreateNewVersion=true`, {
        method: 'POST', headers: { Authorization: scormAuth() }, body: form,
      }).then((r) => r.json() as Promise<{ result: string }>);
      const status = await poll(`${SCORM_CLOUD}/courses/importJobs/${job.result}`);
      const regId = `${course_id}-smoke-${Date.now()}`;
      await scormFetch('/registrations', { courseId: course_id, learner: { id: 'forge-pilot', firstName: 'Pilot', lastName: 'Learner' }, registrationId: regId });
      const { launchLink } = await scormFetch<{ launchLink: string }>(`/registrations/${regId}/launchLink`, { redirectOnExitUrl: 'https://forge.example.com/pilot/done' });
      await writeFile(join(dirname(package_path), 'sandbox-url.txt'), launchLink);
      return text(`Imported (${status}). Registration ${regId}. Launch: ${launchLink}`);
    }

    // Moodle: draft upload, then the site plugin creates a hidden course + SCORM activity.
    const form = new FormData();
    form.set('file_1', zip, basename(package_path));
    const [draft] = await fetch(`${MOODLE}/webservice/upload.php?token=${env.MOODLE_TOKEN}`, { method: 'POST', body: form })
      .then((r) => r.json() as Promise<Array<{ itemid: number }>>);
    const created = await moodle<{ courseid: number }>('local_forge_create_scorm_course', {
      shortname: course_id, fullname: title, categoryid: category_id ?? 1, draftitemid: draft.itemid, visible: 0,
    });
    return text(`Hidden Moodle course ${created.courseid} created. Visibility requires the publish approval.`);
  },
  { annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true } },
);

/** Called by the pipeline after the owner approves. Deliberately not exposed as a tool. */
export async function setCourseVisible(courseId: number): Promise<string> {
  await moodle('core_course_update_courses', { 'courses[0][id]': courseId, 'courses[0][visible]': 1 });
  return `${MOODLE}/course/view.php?id=${courseId}`;
}

async function scormFetch<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SCORM_CLOUD}${path}`, {
    method: 'POST', headers: { Authorization: scormAuth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SCORM Cloud ${path}: HTTP ${res.status}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

async function poll(url: string, tries = 30): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const job = await fetch(url, { headers: { Authorization: scormAuth() } }).then((r) => r.json() as Promise<{ status: string; message?: string }>);
    if (job.status === 'COMPLETE') return 'complete';
    if (job.status === 'ERROR') throw new Error(`import failed: ${job.message}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('import timed out');
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
