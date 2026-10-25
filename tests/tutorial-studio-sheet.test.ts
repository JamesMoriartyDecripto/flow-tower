import { describe, expect, it } from 'vitest';
import { buildSheet, mmss } from '../examples/tutorial-studio/scripts/sheet.mjs';

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
