import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import type { Narration } from '../src/app/voice/narrate';

/** The guided tour driver (#275) on the real dev-squad tower: fake speech, fake narration, fake timers. */
describe('guided tour driver (#275)', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let tour: typeof import('../src/app/voice/tour');
  let towerKeys: string[][];
  let calls: { index: number; part?: number; details?: boolean }[];
  let said: string[];
  let captions: string[];
  let hovers: (string | undefined)[];
  let spoken: boolean;

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
    spoken: () => spoken,
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
    // Records each hover once, so a test can check which node was lit when.
    useStore.subscribe((s, prev) => { if (s.hovered !== prev.hovered) hovers.push(s.hovered); });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    said = [];
    captions = [];
    hovers = [];
    spoken = true;
    useStore.getState().select(undefined);
    useStore.setState({ library: false });
  });

  it('reports no tower when the library is open with nothing behind it', () => {
    useStore.setState({ stack: [] });
    expect(tour.startTour('tour', deps())).toBe('No tower on screen');
    expect(tour.isTouring()).toBe(false);
    useStore.getState().openProject(useStore.getState().workspace!.projects[0]);
  });

  it('walks the layers in order with the caption, and asks the next layer ahead', async () => {
    const n = towerKeys.length;
    const caption = tour.startTour('give me the tour', deps());
    expect(caption).toMatch(/^Guided tour · .+ · \d+ layers$/);
    expect(caption).toContain(`${n} layers`);
    // The first layer's narration is asked at once, and the second one before the first has ended.
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]).toMatchObject({ index: 0 });
    expect(calls[1]).toMatchObject({ index: 1 });
    expect(useStore.getState().focusedLayer).toBe(0);
    expect(captions[0]).toMatch(/^Layer 1 of \d+ · /);
    await vi.runAllTimersAsync();
    expect(useStore.getState().focusedLayer).toBe(n - 1);
    expect(captions.at(-1)).toBe('Tour finished');
    expect(tour.isTouring()).toBe(false);
    // Each layer's intro was said, and then the lines of its nodes.
    expect(said.filter((s) => s.startsWith('Intro'))).toHaveLength(n);
  });

  it('lights each node while its sentence plays', async () => {
    tour.startTour('tour', deps());
    await vi.runAllTimersAsync();
    expect(hovers.slice(0, 3)).toEqual([towerKeys[0][0], towerKeys[0][1], towerKeys[0][2]]);
    expect(hovers.at(-1)).toBeUndefined();
  });

  it('waits the reading time per sentence in captions-only mode', async () => {
    spoken = false;
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    // The intro is read first; the first line is still on screen after 1000 ms.
    await vi.advanceTimersByTimeAsync(1000);
    expect(said).toEqual([]);
    expect(captions.some((c) => c.includes('Line for'))).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(captions.some((c) => c.includes('Line for'))).toBe(true);
    await vi.runAllTimersAsync();
    expect(captions.at(-1)).toBe('Tour finished');
  });

  it('next and previous jump to another layer', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.tourControl('next')).toBe('Next layer');
    await vi.advanceTimersByTimeAsync(0);
    expect(useStore.getState().focusedLayer).toBe(1);
    expect(tour.tourControl('previous')).toBe('Previous layer');
    await vi.advanceTimersByTimeAsync(0);
    expect(useStore.getState().focusedLayer).toBe(0);
    tour.stopTour();
  });

  it('details retells the layer part by part, through parts() slices', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.tourControl('details')).toBe('Layer 1 in detail');
    await vi.advanceTimersByTimeAsync(0);
    const detail = calls.filter((c) => c.details);
    expect(detail.length).toBeGreaterThan(0);
    expect(detail.every((c) => c.index === 0)).toBe(true);
    expect(detail.map((c) => c.part)).toEqual(detail.map((_, i) => i));
    tour.stopTour();
  });

  it('stop ends the tour and clears the highlight', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.tourControl('stop')).toBe('Tour stopped');
    expect(tour.isTouring()).toBe(false);
    expect(captions.at(-1)).toBe('Tour stopped');
    expect(useStore.getState().hovered).toBeUndefined();
    expect(tour.tourControl('next')).toBe('No tour running');
  });
});
