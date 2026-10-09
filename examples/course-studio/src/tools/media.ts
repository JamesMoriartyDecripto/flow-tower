import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const run = promisify(execFile);
const LIMIT = { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 };

/** WebVTT from TTS alignment: 42 chars per line, max 2 lines, never split mid-word. */
export function buildVtt(words: Array<{ word: string; start: number; end: number }>, maxLine = 42): string {
  const cues: string[] = [];
  let line: typeof words = [];
  const flush = () => {
    if (!line.length) return;
    const text = line.map((w) => w.word).join(' ');
    const wrapped = text.length > maxLine ? text.replace(new RegExp(`^(.{1,${maxLine}})\\s`), '$1\n') : text;
    cues.push(`${ts(line[0].start)} --> ${ts(line.at(-1)!.end)}\n${wrapped}`);
    line = [];
  };
  for (const w of words) {
    if ([...line, w].map((x) => x.word).join(' ').length > maxLine * 2) flush();
    line.push(w);
    if (/[.!?]$/.test(w.word)) flush();
  }
  flush();
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
const ts = (s: number) => new Date(s * 1000).toISOString().slice(11, 23);

/**
 * Slides (Marp), diagrams (Mermaid CLI) and video (Remotion Lambda). Everything runs as a
 * child process with an argv array, never through a shell, so content cannot inject commands.
 */
export const renderMedia = tool(
  'render_media',
  'Render media for one segment. kind "slides": Marp markdown -> PNG + PDF. kind "diagram": Mermaid -> SVG. ' +
    'kind "captions": TTS alignment -> WebVTT. kind "video": slides + audio + captions via Remotion Lambda.',
  {
    kind: z.enum(['slides', 'diagram', 'captions', 'video']),
    segment_dir: z.string(),
    segment_id: z.string().regex(/^m\d+-l\d+-s\d+$/),
  },
  async ({ kind, segment_dir, segment_id }) => {
    const base = join(segment_dir, segment_id);
    switch (kind) {
      case 'slides':
        await run('npx', ['--no-install', '@marp-team/marp-cli', `${base}.slides.md`, '--images', 'png', '-o', `${base}.png`], LIMIT);
        await run('npx', ['--no-install', '@marp-team/marp-cli', `${base}.slides.md`, '--pdf', '-o', `${base}.pdf`], LIMIT);
        return ok(`slides -> ${base}.png, ${base}.pdf`);
      case 'diagram':
        await run('npx', ['--no-install', 'mmdc', '-i', `${base}.mmd`, '-o', `${base}.svg`, '-b', 'transparent'], LIMIT);
        return ok(`diagram -> ${base}.svg (remember alt text + long description)`);
      case 'captions': {
        const align = JSON.parse(await readFile(`${base}.alignment.json`, 'utf8')) as { words: Array<{ word: string; start: number; end: number }> };
        await writeFile(`${base}.vtt`, buildVtt(align.words));
        return ok(`captions -> ${base}.vtt (${align.words.length} words)`);
      }
      case 'video': {
        const props = JSON.stringify({ slides: `${base}.png`, audio: `${base}.mp3`, captions: `${base}.vtt` });
        const { stdout } = await run('npx', ['--no-install', 'remotion', 'lambda', 'render', 'forge-lesson', 'Lesson', `--props=${props}`, '--codec=h264'], LIMIT);
        const url = stdout.match(/https:\/\/\S+\.mp4/)?.[0];
        return url ? ok(`video -> ${url} (download to ${base}.mp4)`) : { content: [{ type: 'text' as const, text: stdout.slice(-800) }], isError: true };
      }
    }
  },
  { annotations: { idempotentHint: true } },
);

const ok = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
