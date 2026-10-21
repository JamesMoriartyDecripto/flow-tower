import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import type { Narration } from '../src/app/voice/narrate';

/** The tour's summary cache (#275): a layer is asked once for the tour's life, and a jump clears the hover. */
describe('guided tour summary cache (#275)', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let tour: typeof import('../src/app/voice/tour');
  let towerKeys: string[][];
  let calls: { index: number; part?: number; details?: boolean }[];
  let said: string[];
  let hovers: (string | undefined)[];

  /** A fixed narration: an intro, and one line per node of the layer. */
  const narration = (index: number): Narration => ({
    intro: `Intro ${index}.`,
    lines: towerKeys[index].map((k) => ({ key: k, sentence: `Line for ${k} in layer ${index}.` })),
  });

  const deps = () => ({
    narrate: (async (_tower: unknown, index: number, opts: { details?: boolean; part?: number }) => {
      calls.push({ index, part: opts.part, details: opts.details });
      return narration(index);
    }) as unknown as typeof import('../src/app/voice/narrate').narrateLayer,
    say: (sentence: string, onPlay?: () => void) => { said.push(sentence); onPlay?.(); },
    drained: async () => undefined,
    newReply: () => undefined,
    stopSpeaking: () => undefined,
    spoken: () => true,
    caption: () => undefined,
    keepAlive: () => undefined,
    busy: () => false,
  });

  /** The summary asks only, so a part of a details retelling is not counted here. */
  const summaryAsks = (index: number) => calls.filter((c) => !c.details && c.index === index).length;

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
    calls = [];
    said = [];
    hovers = [];
    useStore.getState().select(undefined);
    useStore.setState({ library: false });
  });

  it('next then previous asks the model once per layer', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.tourControl('next')).toBe('Next layer');
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.tourControl('previous')).toBe('Previous layer');
    await vi.advanceTimersByTimeAsync(0);
    expect(useStore.getState().focusedLayer).toBe(0);
    // Layers 0 and 1 were told and then revisited: each was asked for exactly once.
    expect(summaryAsks(0)).toBe(1);
    expect(summaryAsks(1)).toBe(1);
    tour.stopTour();
  });

  it('details on a layer does not ask again for the next layer', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(summaryAsks(1)).toBe(1);
    expect(tour.tourControl('details')).toBe('Layer 1 in detail');
    await vi.advanceTimersByTimeAsync(0);
    // The retelling is by part, and the cached summary of layer 2 is reused.
    expect(calls.some((c) => c.details)).toBe(true);
    expect(summaryAsks(1)).toBe(1);
    tour.stopTour();
  });

  it('after next the hover is cleared until the new layer first line plays', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    const before = hovers.length;
    tour.tourControl('next');
    // The jump clears the hover at once, not after the new layer's first line.
    expect(useStore.getState().hovered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    // The first node lit after the jump is the new layer's first one; nothing of the old layer shows again.
    const lit = hovers.slice(before).filter((h) => h !== undefined);
    expect(lit[0]).toBe(towerKeys[1][0]);
    expect(lit.some((h) => towerKeys[0].includes(h!))).toBe(false);
    tour.stopTour();
  });
});
