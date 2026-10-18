import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { userContent } from '../examples/model-benchmark/scripts/endpoints.mjs';
import { loadTask, taskProblems } from '../examples/model-benchmark/scripts/tasks.mjs';

// loadTask gives `request: null` when a task has no Request block, but endpoints.d.mts types it as optional
// (undefined). userContent never reads `request`, so the test narrows the type here instead of editing the declaration.
type EndpointArg = Parameters<typeof userContent>[0];
const asEndpointTask = (task: ReturnType<typeof loadTask>) => task as unknown as EndpointArg;

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

    const content = userContent(asEndpointTask(task), task.prompt) as { type: string; text?: string; image_url?: { url: string } }[];
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
    expect(userContent(asEndpointTask(task), task.prompt)).toBe(PROMPT);
  });

  it('reports a missing image and an unsupported extension', () => {
    const missing = loadTask(writeTask('missing.md', 'images: gone.png\n'));
    expect(taskProblems(missing)).toContain('images fixture missing: gone.png');

    writeFileSync(join(dir, 'frame.bmp'), Buffer.from('BM\0\0\0\0'));
    const bmp = loadTask(writeTask('bmp.md', 'images: frame.bmp\n'));
    expect(taskProblems(bmp)).toContain('images fixture must be png, jpg, webp or gif: frame.bmp');
  });

  it('refuses an image path that leaves the task folder', () => {
    // The file sits one folder above the task, so only the containment check stands between it and the prompt.
    const outside = join(dir, '..', 'outside.png');
    writeFileSync(outside, Buffer.from(PNG_BASE64, 'base64'));
    try {
      const task = loadTask(writeTask('escape.md', 'images: ../outside.png\n'));
      expect(() => userContent(asEndpointTask(task), task.prompt)).toThrow('image outside the task folder');
    } finally {
      rmSync(outside, { force: true });
    }
  });
});
