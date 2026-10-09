import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import JSZip from 'jszip';
import { z } from 'zod';

const Sco = z.object({ id: z.string().regex(/^[A-Za-z][\w-]*$/), title: z.string(), href: z.string(), files: z.array(z.string()) });
const Module = z.object({ id: z.string(), title: z.string(), scos: z.array(Sco).min(1) });

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

/** SCORM 2004 4th Edition manifest: one organization, a module per item, a SCO per lesson. */
function scorm2004Manifest(id: string, title: string, modules: z.infer<typeof Module>[], lom: string, mastery: number) {
  const items = modules.map((m) => `
      <item identifier="${m.id}"><title>${esc(m.title)}</title>${m.scos.map((s) => `
        <item identifier="item-${s.id}" identifierref="res-${s.id}"><title>${esc(s.title)}</title>${s.id.includes('quiz') ? `
          <imsss:sequencing><imsss:objectives><imsss:primaryObjective objectiveID="${s.id}-obj" satisfiedByMeasure="true">
            <imsss:minNormalizedMeasure>${mastery}</imsss:minNormalizedMeasure></imsss:primaryObjective></imsss:objectives></imsss:sequencing>` : ''}
        </item>`).join('')}
        <imsss:sequencing><imsss:controlMode choice="true" flow="true" forwardOnly="false"/></imsss:sequencing>
      </item>`).join('');
  const resources = modules.flatMap((m) => m.scos).map((s) => `
    <resource identifier="res-${s.id}" type="webcontent" adlcp:scormType="sco" href="${s.href}">${s.files.map((f) => `<file href="${f}"/>`).join('')}
      <dependency identifierref="common"/></resource>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3" xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3" xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:lom="http://ltsc.ieee.org/xsd/LOM">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion>${lom}</metadata>
  <organizations default="org-${id}"><organization identifier="org-${id}"><title>${esc(title)}</title>${items}
  </organization></organizations>
  <resources>${resources}
    <resource identifier="common" type="webcontent" adlcp:scormType="asset"><file href="shared/scorm-api.js"/><file href="shared/player.css"/></resource>
  </resources>
</manifest>`;
}

/** cmi5 course structure: AUs launched by the LMS, results go to the LRS as xAPI statements. */
const cmi5Xml = (id: string, title: string, modules: z.infer<typeof Module>[], mastery: number) => `<?xml version="1.0" encoding="utf-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://forge.example.com/courses/${id}"><title><langstring lang="en-US">${esc(title)}</langstring></title></course>${modules.map((m) => `
  <block id="https://forge.example.com/courses/${id}/${m.id}"><title><langstring lang="en-US">${esc(m.title)}</langstring></title>${m.scos.map((s) => `
    <au id="https://forge.example.com/courses/${id}/${s.id}" moveOn="${s.id.includes('quiz') ? 'Passed' : 'Completed'}"${s.id.includes('quiz') ? ` masteryScore="${mastery}"` : ''}>
      <title><langstring lang="en-US">${esc(s.title)}</langstring></title><url>${s.href}</url></au>`).join('')}
  </block>`).join('')}
</courseStructure>`;

/** Deterministic hash of the build (used by the review board to pin what was reviewed). */
export async function contentHash(dir: string): Promise<string> {
  const files = (await readdir(dir, { recursive: true })).filter((f) => /\.(md|json|vtt|svg)$/.test(f) && !f.includes('keys')).sort();
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(await readFile(join(dir, f)));
  return h.digest('hex').slice(0, 16);
}

export const scormPackage = tool(
  'scorm_package',
  'Build a SCORM 2004 4th Ed., SCORM 1.2 or cmi5 package from the course map. Deterministic. ' +
    'The accessibility gate runs before this tool and denies packaging if alt text, captions or transcripts are missing.',
  {
    run_dir: z.string(),
    course_id: z.string().regex(/^[a-z0-9-]{3,48}$/),
    title: z.string().max(120),
    standard: z.enum(['scorm2004-4th', 'scorm12', 'cmi5']).default('scorm2004-4th'),
    mastery_score: z.number().min(0).max(1).default(0.8),
    modules: z.array(Module).min(1),
    lom_xml: z.string().default('').describe('LOM metadata fragment from the metadata tagger'),
  },
  async ({ run_dir, course_id, title, standard, mastery_score, modules, lom_xml }) => {
    if (standard === 'scorm12') return { content: [{ type: 'text', text: 'SCORM 1.2 export is deprecated here; use scorm2004-4th.' }], isError: true };
    const zip = new JSZip();
    const site = join(run_dir, 'package', 'site');
    for (const f of await readdir(site, { recursive: true })) {
      const abs = join(site, f);
      if (/\.[a-z0-9]+$/i.test(f)) zip.file(relative(site, abs), await readFile(abs));
    }
    if (standard === 'cmi5') zip.file('cmi5.xml', cmi5Xml(course_id, title, modules, mastery_score));
    else zip.file('imsmanifest.xml', scorm2004Manifest(course_id, title, modules, lom_xml, mastery_score));

    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const out = join(run_dir, 'package', `${course_id}-${standard}.zip`);
    await writeFile(out, buf);
    const sha = createHash('sha256').update(buf).digest('hex');
    return { content: [{ type: 'text', text: `Package ${out} (${(buf.length / 1e6).toFixed(1)} MB) sha256 ${sha}` }] };
  },
  { annotations: { readOnlyHint: false, idempotentHint: true } },
);
