import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import type { Narration } from '../src/app/voice/narrate';

/** Review fixes for the guided tour (#275): the tour ends when the user leaves its tower, and "next" keeps the prefetch. */
describe('guided tour fixes (#275)', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let tour: typeof import('../src/app/voice/tour');
  let projects: string[];
  let towerKeys: string[][];
  let calls: { index: number; part?: number; details?: boolean }[];
  let captions: string[];
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
    say: (_sentence: string, onPlay?: () => void) => { onPlay?.(); },
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
    projects = workspace.projects;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    captions = [];
    spoken = true;
    tour.stopTour();
    useStore.getState().select(undefined);
    useStore.setState({ library: false });
    useStore.getState().openProject(projects[0]);
  });

  it('opening another project ends the tour and it focuses no more layers', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.isTouring()).toBe(true);
    // A second project when there is one. Otherwise: a copy of the stack with the same ids is a live reload and
    // keeps the tour (#275 M1); an empty stack is a different project's worth of change and ends it.
    if (projects.length > 1) {
      useStore.getState().openProject(projects[1]);
    } else {
      useStore.setState({ stack: [...useStore.getState().stack] });
      expect(tour.isTouring()).toBe(true);
      useStore.setState({ stack: [] });
    }
    expect(tour.isTouring()).toBe(false);
    expect(captions.at(-1)).toBe('Tour stopped');
    // The loop is gone: no layer of the old tower is asked for or focused after the user left it.
    const calledBefore = calls.length;
    await vi.runAllTimersAsync();
    expect(calls.length).toBe(calledBefore);
  });

  it('opening the library ends the tour', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    useStore.getState().showLibrary(true);
    expect(tour.isTouring()).toBe(false);
    expect(captions.at(-1)).toBe('Tour stopped');
    const calledBefore = calls.length;
    await vi.runAllTimersAsync();
    // No narration is asked for after the user left the tower.
    expect(calls.length).toBe(calledBefore);
  });

  it('a tour that runs to the end drops its store listener', async () => {
    tour.startTour('tour', deps());
    await vi.runAllTimersAsync();
    expect(tour.isTouring()).toBe(false);
    expect(captions.at(-1)).toBe('Tour finished');
    // Changing the stack now must not caption anything: the listener is gone.
    const before = captions.length;
    useStore.setState({ stack: [...useStore.getState().stack] });
    expect(captions.length).toBe(before);
  });

  it('after next, the prefetched layer is narrated only once', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    // Layer 1 is current and layer 2 was prefetched while it plays.
    expect(calls.map((c) => c.index)).toEqual([0, 1]);
    expect(tour.tourControl('next')).toBe('Next layer');
    await vi.advanceTimersByTimeAsync(0);
    const perLayer = (index: number) => calls.filter((c) => c.index === index && !c.details).length;
    expect(perLayer(1)).toBe(1);
    await vi.runAllTimersAsync();
    for (let i = 0; i < towerKeys.length; i++) {
      expect(perLayer(i)).toBe(1);
    }
    expect(captions.at(-1)).toBe('Tour finished');
  });
});
