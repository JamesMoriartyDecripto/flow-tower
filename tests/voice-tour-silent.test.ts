import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import type { Narration } from '../src/app/voice/narrate';

/**
 * The guided tour (#275) when speech plays nothing: every synthesis fails or autoplay is blocked, so no onPlay
 * runs. The layer must then be shown in captions, and the rest of the tour too.
 */
describe('guided tour with silent speech (#275)', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let tour: typeof import('../src/app/voice/tour');
  let towerKeys: string[][];
  let said: string[];
  let captions: string[];
  let hovers: (string | undefined)[];

  /** A fixed narration: an intro, and one line per node of the layer. */
  const narration = (index: number): Narration => ({
    intro: `Intro ${index}.`,
    lines: towerKeys[index].map((k) => ({ key: k, sentence: `Line for ${k} in layer ${index}.` })),
  });

  /** Speech that never plays: say() queues nothing audible, and drained() resolves at once. */
  const silentDeps = () => ({
    narrate: (async (_tower: unknown, index: number) => narration(index)) as unknown as typeof import('../src/app/voice/narrate').narrateLayer,
    say: (sentence: string) => { said.push(sentence); },
    drained: async () => undefined,
    newReply: () => undefined,
    stopSpeaking: () => undefined,
    spoken: () => true,
    caption: (text: string) => { captions.push(text); },
    keepAlive: () => undefined,
    busy: () => false,
  });

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ useStore } = await import('../src/app/store'));
    tour = await import('../src/app/voice/tour');
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.getState().setWorkspace(workspace);
    useStore.getState().openProject(workspace.projects[0]);
    const t = useStore.getState().workspace!.towers[workspace.projects[0]];
    towerKeys = t.layers.map((l) => l.nodes.map((n) => n.key));
    useStore.subscribe((s, prev) => { if (s.hovered !== prev.hovered) hovers.push(s.hovered); });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    said = [];
    captions = [];
    hovers = [];
    useStore.getState().select(undefined);
    useStore.setState({ library: false });
  });

  it('shows the first layer line by line in captions, with the hover and reading time', async () => {
    tour.startTour('tour', silentDeps());
    await vi.advanceTimersByTimeAsync(0);
    // The speech was tried for the layer: the intro and each line were queued.
    expect(said).toContain('Intro 0.');
    const lines = towerKeys[0].map((k) => `Line for ${k} in layer 0.`);
    for (const [i, line] of lines.entries()) {
      // Each line is captioned and lit once its turn comes; wait for it in steps of a tenth of a second.
      for (let waited = 0; !captions.some((c) => c.endsWith(line)) && waited < 20000; waited += 100) {
        await vi.advanceTimersByTimeAsync(100);
      }
      expect(captions.filter((c) => c.endsWith(line))).toHaveLength(1);
      expect(hovers.at(-1)).toBe(towerKeys[0][i]);
      // The line stays for its reading time (at least 2 s) before the next one is captioned.
      const readMs = Math.max(2000, (line.length / 15) * 1000);
      await vi.advanceTimersByTimeAsync(readMs - 100);
      // Still the same line on screen, not yet the next one.
      expect(captions.at(-1)?.endsWith(line)).toBe(true);
    }
    for (const line of lines) expect(captions.some((c) => c.endsWith(line))).toBe(true);
    tour.stopTour();
  });

  it('runs the next layer in captions only, without calling say', async () => {
    tour.startTour('tour', silentDeps());
    await vi.runAllTimersAsync();
    // The first layer tried speech once; after it, nothing is said and the tour is captions only.
    expect(said.filter((s) => s.startsWith('Intro'))).toEqual(['Intro 0.']);
    expect(said.some((s) => s.includes('in layer 1'))).toBe(false);
    expect(captions.some((c) => c.includes('Layer 2 of ') && c.includes('Intro 1.'))).toBe(true);
    expect(captions.some((c) => c.endsWith(`Line for ${towerKeys[1][0]} in layer 1.`))).toBe(true);
    expect(captions.at(-1)).toBe('Tour finished');
    expect(tour.isTouring()).toBe(false);
  });
});
