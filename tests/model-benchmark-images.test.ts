import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadTask, taskProblems, userContent } from '../examples/model-benchmark/scripts/tasks.mjs';

// A valid 1x1 PNG: enough bytes for the task loader, which never decodes the image.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const dir = mkdtempSync(join(tmpdir(), 'bench-images-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PROMPT = 'Does the frame show a red button?';
const EXPECTED = '## Expected\n\n```regex\nyes\n```\n';

function writeTask(name: string, front: string) {
  const file = join(dir, name);
  writeFileSync(file, `---\nid: ${name.replace('.md', '')}\ncheck: regex\n${front}---\n# Frame QA\n\n## Prompt\n\n${PROMPT}\n\n${EXPECTED}`);
  return file;
}

describe('model benchmark: images for vision tasks', () => {
  const pngBytes = Buffer.from(PNG_BASE64, 'base64');
  writeFileSync(join(dir, 'frame.png'), pngBytes);

  it('loads images, passes the checks, and sends the text part then the image as a data URL', () => {
    const task = loadTask(writeTask('vision.md', 'images: frame.png\n'));
    expect(task.images).toEqual(['frame.png']);
    expect(taskProblems(task)).toEqual([]);

    const content = userContent(task) as { type: string; text?: string; image_url?: { url: string } }[];
    expect(content[0]).toEqual({ type: 'text', text: PROMPT });
    expect(content[1].type).toBe('image_url');
    const url = content[1].image_url?.url ?? '';
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const payload = url.slice('data:image/png;base64,'.length);
    expect(Buffer.from(payload, 'base64').equals(pngBytes)).toBe(true);
  });

  it('keeps a text-only task as the plain prompt string', () => {
    const task = loadTask(writeTask('text.md', ''));
    expect(task.images).toEqual([]);
    expect(userContent(task)).toBe(PROMPT);
  });

  it('reports a missing image and an unsupported extension', () => {
    const missing = loadTask(writeTask('missing.md', 'images: gone.png\n'));
    expect(taskProblems(missing)).toContain('image missing: gone.png');

    writeFileSync(join(dir, 'frame.gif'), Buffer.from('GIF89a'));
    const gif = loadTask(writeTask('gif.md', 'images: frame.gif\n'));
    expect(taskProblems(gif)).toContain('image must be .png, .jpg, .jpeg or .webp: frame.gif');
  });
});
