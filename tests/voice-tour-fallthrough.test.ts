import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import type { Narration } from '../src/app/voice/narrate';

/**
 * "dettagli" and "stop" are tour words only while a tour runs (#275 M2). With no tour they must come back as
 * NOT_UNDERSTOOD, so voice.ts hands them to the agent as it did before the tour existed.
 */
describe('tour words outside a tour (#275 M2)', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let tour: typeof import('../src/app/voice/tour');
  let actions: typeof import('../src/app/voice/actions');
  let towerKeys: string[][];
  let captions: string[];

  const narration = (index: number): Narration => ({
    intro: `Intro ${index}.`,
    lines: towerKeys[index].map((k) => ({ key: k, sentence: `Line for ${k} in layer ${index}.` })),
  });

  const tourDeps = () => ({
    narrate: (async (_tower: unknown, index: number) => narration(index)) as unknown as typeof import('../src/app/voice/narrate').narrateLayer,
    say: (_sentence: string, onPlay?: () => void) => { onPlay?.(); },
    drained: async () => undefined,
    newReply: () => undefined,
    stopSpeaking: () => undefined,
    spoken: () => true,
    caption: (text: string) => { captions.push(text); },
    keepAlive: () => undefined,
    busy: () => false,
  });

  const deps = () => ({ stop: () => undefined, tour: tourDeps() });

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ useStore } = await import('../src/app/store'));
    tour = await import('../src/app/voice/tour');
    actions = await import('../src/app/voice/actions');
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.getState().setWorkspace(workspace);
    useStore.getState().openProject(workspace.projects[0]);
    const t = useStore.getState().workspace!.towers[workspace.projects[0]];
    towerKeys = t.layers.map((l) => l.nodes.map((n) => n.key));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    captions = [];
    tour.stopTour();
    useStore.getState().select(undefined);
    useStore.setState({ library: false });
    useStore.getState().openProject(useStore.getState().workspace!.projects[0]);
  });

  it('details and stop with no tour return NOT_UNDERSTOOD, so the agent gets them', () => {
    expect(tour.isTouring()).toBe(false);
    expect(actions.execute({ kind: 'tour', op: 'details', said: 'dettagli' }, deps())).toBe(actions.NOT_UNDERSTOOD);
    expect(actions.execute({ kind: 'tour', op: 'stop', said: 'stop' }, deps())).toBe(actions.NOT_UNDERSTOOD);
  });

  it('details and stop with a tour running reach the tour control', async () => {
    expect(actions.execute({ kind: 'tour', op: 'start', said: 'guided tour', lang: 'en' }, deps())).toMatch(/^Guided tour/);
    await vi.advanceTimersByTimeAsync(0);
    expect(tour.isTouring()).toBe(true);
    expect(actions.execute({ kind: 'tour', op: 'details', said: 'dettagli' }, deps())).toMatch(/in detail$/);
    expect(actions.execute({ kind: 'tour', op: 'stop', said: 'stop' }, deps())).toBe('Tour stopped');
    expect(tour.isTouring()).toBe(false);
    expect(captions).toContain('Tour stopped');
  });
});
