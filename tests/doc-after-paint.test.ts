import { describe, expect, it } from 'vitest';
import { afterPaint } from '../src/app/doc/afterPaint';

describe('afterPaint', () => {
  it('waits for the fonts, then for two animation frames', async () => {
    const frames: (() => void)[] = [];
    const nextFrame = (cb: () => void) => { frames.push(cb); };
    let resolved = false;
    const done = afterPaint(Promise.resolve(), nextFrame).then(() => { resolved = true; });

    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    expect(resolved).toBe(false);

    frames[0]();
    expect(frames).toHaveLength(2);
    expect(resolved).toBe(false);

    frames[1]();
    await done;
    expect(resolved).toBe(true);
  });

  it('does not schedule a frame before the fonts are ready', async () => {
    let release!: () => void;
    const fonts = new Promise<void>((r) => { release = r; });
    const frames: (() => void)[] = [];
    void afterPaint(fonts, (cb) => { frames.push(cb); });

    await Promise.resolve();
    expect(frames).toHaveLength(0);
    release();
    await fonts;
    await Promise.resolve();
    expect(frames).toHaveLength(1);
  });
});
