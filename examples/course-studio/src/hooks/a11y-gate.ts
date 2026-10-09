import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Run } from '../config';
import { deny } from './decide';

/**
 * PreToolUse on mcp__studio__scorm_package. The last line of defence before anything is
 * packaged: deterministic checks for the WCAG 2.2 criteria that are cheap to verify
 * mechanically. The accessibility auditor covers the judgement calls (alt text QUALITY,
 * keyboard flow, contrast in context); this gate makes sure nothing is simply missing.
 */
export const a11yGate = (run: Run): HookCallback => async () => {
  const problems: string[] = [];
  const lessons = join(run.dir, 'lessons');
  const media = join(run.dir, 'media');

  for (const file of readdirSync(lessons).filter((f) => f.endsWith('.md'))) {
    const md = readFileSync(join(lessons, file), 'utf8');
    // 1.1.1 Non-text content: every image needs alt text (empty alt only if marked decorative).
    for (const m of md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g)) {
      if (!m[1].trim() && m[3] !== 'decorative') problems.push(`${file}: image ${m[2]} has no alt text (1.1.1)`);
    }
    // 1.3.1 / 2.4.6: one h1, no skipped heading levels.
    const levels = [...md.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
    if (levels.filter((l) => l === 1).length !== 1) problems.push(`${file}: needs exactly one h1 (1.3.1)`);
    levels.forEach((l, i) => i > 0 && l > levels[i - 1] + 1 && problems.push(`${file}: heading jumps h${levels[i - 1]} -> h${l} (1.3.1)`));
    // 3.1.1 Language of page.
    if (!/^lang:\s*\w+/m.test(md)) problems.push(`${file}: front matter has no lang (3.1.1)`);
  }

  if (existsSync(media)) {
    for (const video of readdirSync(media).filter((f) => f.endsWith('.mp4'))) {
      const base = video.replace(/\.mp4$/, '');
      // 1.2.2 Captions (prerecorded) and 1.2.3 media alternative (transcript).
      if (!existsSync(join(media, `${base}.vtt`))) problems.push(`${video}: no captions .vtt (1.2.2)`);
      if (!existsSync(join(media, `${base}.transcript.md`))) problems.push(`${video}: no transcript (1.2.3)`);
    }
  }

  return problems.length
    ? deny(`Accessibility gate: ${problems.length} problem(s). Fix before packaging:\n- ${problems.slice(0, 15).join('\n- ')}`)
    : {};
};
