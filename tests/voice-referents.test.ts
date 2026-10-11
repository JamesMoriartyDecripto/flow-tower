import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';

/** The list the user was last shown: what "il prossimo" / "the next one" refers to (#130). */
describe('voice list referents (#130)', () => {
  let clearList: typeof import('../src/app/voice/referents').clearList;
  let currentList: typeof import('../src/app/voice/referents').currentList;
  let setList: typeof import('../src/app/voice/referents').setList;
  let stepIndex: typeof import('../src/app/voice/referents').stepIndex;
  let stepList: typeof import('../src/app/voice/referents').stepList;
  let runItsFile: typeof import('../src/app/voice/referents').runItsFile;
  let runStep: typeof import('../src/app/voice/referents').runStep;
  let useStore: typeof import('../src/app/store').useStore;

  beforeAll(async () => {
    // referents reads the store (the handlers act on screen), and the store reads location at load.
    vi.stubGlobal('location', { search: '' });
    ({ clearList, currentList, setList, stepIndex, stepList, runItsFile, runStep } = await import('../src/app/voice/referents'));
    ({ useStore } = await import('../src/app/store'));
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.getState().setWorkspace(workspace);
  });

  beforeEach(() => clearList());

  it('steps inside the list and stops at both ends', () => {
    expect(stepIndex(3, 0, 1)).toBe(1);
    expect(stepIndex(3, 1, 1)).toBe(2);
    expect(stepIndex(3, 2, 1)).toBeUndefined();
    expect(stepIndex(3, 1, -1)).toBe(0);
    expect(stepIndex(3, 0, -1)).toBeUndefined();
  });

  it('has no step in an empty list', () => {
    expect(stepIndex(0, -1, 1)).toBeUndefined();
    expect(stepIndex(0, 0, -1)).toBeUndefined();
  });

  it('walks a list set for the tower on screen', () => {
    setList({ tower: 'a', keys: ['x', 'y', 'z'], cursor: -1, source: 'search' });
    expect(currentList('a')?.keys).toEqual(['x', 'y', 'z']);
    expect(stepList(1)).toBe('x');
    expect(stepList(1)).toBe('y');
    expect(currentList('a')?.cursor).toBe(1);
    expect(stepList(-1)).toBe('x');
    expect(stepList(-1)).toBeUndefined();
    expect(currentList('a')?.cursor).toBe(0);
  });

  it('returns nothing at the end of the list', () => {
    setList({ tower: 'a', keys: ['only'], cursor: 0, source: 'layer' });
    expect(stepList(1)).toBeUndefined();
  });

  it('ignores a list from another tower', () => {
    setList({ tower: 'a', keys: ['x'], cursor: -1, source: 'layer' });
    expect(currentList('b')).toBeUndefined();
    expect(stepList(1)).toBeUndefined();
  });

  it('forgets the list on clear', () => {
    setList({ tower: 'a', keys: ['x'], cursor: -1, source: 'layer' });
    clearList();
    expect(currentList('a')).toBeUndefined();
  });

  it('opens the numbered file of the selected node (#130b)', () => {
    const s = useStore.getState();
    s.openFile(undefined);
    s.select(undefined);
    expect(runItsFile(0)).toBe('No node selected');
    useStore.getState().select('intake.triage');
    expect(runItsFile(0)).toBe('src/triage.ts');
    expect(useStore.getState().file).toMatchObject({ index: 0 });
    expect(runItsFile(3)).toBe('Only 1 files');
    // A node without files says so, by its label.
    const s2 = useStore.getState();
    const tower = s2.workspace!.towers[s2.stack[s2.stack.length - 1]]!;
    const bare = tower.layers.flatMap((l) => l.nodes).find((n) => n.files.length === 0 && n.resources.length === 0)!;
    useStore.getState().select(bare.key);
    expect(runItsFile(0)).toBe(`${bare.label} has no files`);
  });

  it('steps the last list shown before the layer nodes (#130b)', () => {
    const s = useStore.getState();
    const tower = s.workspace!.towers[s.stack[s.stack.length - 1]]!;
    s.openFile(undefined);
    s.select(undefined);
    setList({ tower: tower.id, keys: ['orchestration.lead', 'intake.triage'], cursor: -1, source: 'search' });
    const label = tower.layers.flatMap((l) => l.nodes).find((n) => n.key === 'orchestration.lead')!.label;
    expect(runStep(1, 'auto')).toBe(label);
    expect(useStore.getState().selected).toBe('orchestration.lead');
    expect(runStep(1, 'auto')).toBe('Triage router');
    expect(runStep(1, 'auto')).toBe('That was the last one');
    // A step past the end does not move the cursor, so going back returns the last one.
    expect(runStep(-1, 'auto')).toBe(label);
    expect(runStep(-1, 'auto')).toBe('That was the first one');
  });

  it('steps the viewer and the focused layer, stopping at the ends (#130b)', () => {
    const s = useStore.getState();
    s.openFile({ tower: 'dev-squad/dev-squad.tower.yaml', files: ['a.ts', 'b.ts'], index: 0 });
    expect(runStep(1, 'file')).toBe('b.ts');
    expect(runStep(1, 'file')).toBe('No more files');
    expect(runStep(-1, 'file')).toBe('a.ts');
    useStore.getState().openFile(undefined);
    s.select(undefined);
    s.focusLayer(0);
    const first = runStep(1, 'auto');
    expect(useStore.getState().selected).toBeTruthy();
    expect(runStep(-1, 'auto')).toBe('That was the first one');
    expect(first).toBeTruthy();
    // Nothing focused and nothing selected: nothing to move through.
    useStore.getState().select(undefined);
    useStore.getState().focusLayer(undefined);
    expect(runStep(1, 'auto')).toBe('Nothing to move through');
  });
});
