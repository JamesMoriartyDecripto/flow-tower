import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSheet,
  mmss,
  parseChapters,
  readReport,
} from '../examples/tutorial-studio/scripts/sheet.mjs';

describe('mmss', () => {
  it('formats m:ss with zero-padded seconds', () => {
    expect(mmss(65000)).toBe('1:05');
    expect(mmss(0)).toBe('0:00');
    expect(mmss(600000)).toBe('10:00');
  });
});

describe('buildSheet', () => {
  const html = buildSheet({
    demo: 'd',
    report: {
      demo: 'd',
      totalDurationMs: 65000,
      scenes: [
        { scene: 'a', startMs: 0, endMs: 4000, durationMs: 4000 },
        { scene: 'b', startMs: 4000, endMs: 9500, durationMs: 5500 },
      ],
    },
    scenes: [{ scene: 'a', text: 'Say <b> & "q"' }],
    thumbs: new Set(['a']),
  });

  it('shows the thumbnail only for scenes that have one', () => {
    expect(html).toContain('.argo/d/thumbs/a.jpg');
    expect(html).toContain('no thumbnail');
  });

  it('marks scenes without narration', () => {
    expect(html).toContain('no narration');
  });

  it('escapes narration text', () => {
    expect(html).toContain('Say &lt;b&gt; &amp; &quot;q&quot;');
    expect(html).not.toContain('<b>');
  });

  it('keeps scene order', () => {
    expect(html.indexOf('<h2>a</h2>')).toBeLessThan(html.indexOf('<h2>b</h2>'));
  });
});

describe('parseChapters', () => {
  const text = [
    ';FFMETADATA1',
    '[CHAPTER]',
    'TIMEBASE=1/1000',
    'START=101',
    'END=8193',
    'title=a',
    '[CHAPTER]',
    'TIMEBASE=1/1000',
    'START=8193',
    'END=13577',
    'title=b',
    '',
  ].join('\n');

  it('returns each chapter as a scene with its duration', () => {
    const parsed = parseChapters(text);
    expect(parsed.scenes).toEqual([
      { scene: 'a', startMs: 101, endMs: 8193, durationMs: 8092 },
      { scene: 'b', startMs: 8193, endMs: 13577, durationMs: 5384 },
    ]);
  });

  it('takes the total from the last chapter end', () => {
    expect(parseChapters(text).totalDurationMs).toBe(13577);
  });

  it('returns no scenes and a zero total for an empty text', () => {
    expect(parseChapters('')).toEqual({ totalDurationMs: 0, scenes: [] });
  });
});

describe('readReport', () => {
  it('falls back to the chapters when scene-report.json is truncated', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sheet-'));
    try {
      await writeFile(join(dir, 'scene-report.json'), '{"scenes": [');
      await writeFile(
        join(dir, 'chapters.txt'),
        [';FFMETADATA1', '[CHAPTER]', 'TIMEBASE=1/1000', 'START=0', 'END=4000', 'title=a', ''].join('\n'),
      );
      const report = await readReport(dir, 'd');
      expect(report).toEqual({
        demo: 'd',
        totalDurationMs: 4000,
        scenes: [{ scene: 'a', startMs: 0, endMs: 4000, durationMs: 4000 }],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
