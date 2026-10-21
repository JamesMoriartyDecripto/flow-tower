import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import type { Narration } from '../src/app/voice/narrate';

/** A stopped tour stays stopped (#275 L6), and a live reload with the same stack keeps the tour (#275 M1). */
describe('guided tour stop (#275)', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let tour: typeof import('../src/app/voice/tour');
  let towerKeys: string[][];
  let focus: number[];
  let narrated: number[];
  let said: string[];
  let captions: string[];
  let spoken: boolean;

  /** A fixed narration: an intro, and one line per node of the layer. */
  const narration = (index: number): Narration => ({
    intro: `Intro ${index}.`,
    lines: towerKeys[index].map((k) => ({ key: k, sentence: `Line for ${k} in layer ${index}.` })),
  });

  const deps = () => ({
    narrate: (async (_tower: unknown, index: number) => {
      narrated.push(index);
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
    useStore.subscribe((s, prev) => { if (s.focusedLayer !== prev.focusedLayer && s.focusedLayer !== undefined) focus.push(s.focusedLayer); });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    focus = [];
    narrated = [];
    said = [];
    captions = [];
    spoken = true;
    tour.stopTour();
    useStore.getState().select(undefined);
    useStore.setState({ library: false });
    useStore.getState().openProject(useStore.getState().workspace!.projects[0]);
    // Records each layer focus, so a test can see whether the loop moved the view after a stop.
    focus.length = 0;
  });

  it('after tourControl stop, 60 s later no layer is focused, narrated or said', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.tourControl('stop')).toBe('Tour stopped');
    const before = { focus: focus.length, narrated: narrated.length, said: said.length };
    await vi.advanceTimersByTimeAsync(60_000);
    expect(focus.length).toBe(before.focus);
    expect(narrated.length).toBe(before.narrated);
    expect(said.length).toBe(before.said);
  });

  it('after stopTour, 60 s later no layer is focused, narrated or said', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    tour.stopTour();
    const before = { focus: focus.length, narrated: narrated.length, said: said.length };
    await vi.advanceTimersByTimeAsync(60_000);
    expect(focus.length).toBe(before.focus);
    expect(narrated.length).toBe(before.narrated);
    expect(said.length).toBe(before.said);
  });

  it('a live reload with the same stack ids keeps the tour running', async () => {
    tour.startTour('tour', deps());
    await vi.advanceTimersByTimeAsync(0);
    useStore.setState({ stack: [...useStore.getState().stack] });
    expect(tour.isTouring()).toBe(true);
    tour.stopTour();
  });
});
