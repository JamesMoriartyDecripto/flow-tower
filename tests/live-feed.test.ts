import { describe, expect, it, vi } from 'vitest';
import { FlowEventSchema } from '../src/core/events';
import type { Workspace } from '../src/core/types';

/** #136: the live feed's Tower scope covers the tower on screen and its sub-towers, nothing else. */

const ev = (targets: string[]) => ({ ...FlowEventSchema.parse({ kind: 'tool.start', tool: 'Bash' }), id: 1, ts: 0, targets });

/** Only what `descendants` reads: a tower per id, each nesting the sub-towers named for it. */
const workspace = (nested: Record<string, string[]>) => ({
  projects: [],
  loadedAt: '',
  towers: Object.fromEntries(Object.entries(nested).map(([id, subs]) => [id, {
    id, name: id, tags: [], runtimes: {}, links: [],
    layers: [{
      id: 'l', index: 0, title: 'L', edges: [],
      nodes: subs.map((s) => ({ key: `n.${s}`, layer: 'l', type: 'process', label: s, tools: [], files: [], ops: {}, meta: {}, tower: s })),
    }],
  }])),
}) as unknown as Workspace;

// Imported dynamically: `src/app/live` reads `location.search` while building its store at import time.
vi.stubGlobal('location', { search: '' });
const { descendants, towerScope, errorLayers, foldRepeats } = await import('../src/app/live');
const desc = descendants(workspace({ parent: ['child'], child: ['grand'], sibling: [] }));

describe('towerScope', () => {
  it('keeps events that land in a sub-tower and drops one from a sibling project', () => {
    const here = ev(['parent#l.a']);
    const child = ev(['child#l.b']);
    const grand = ev(['grand#l.c']);
    const sibling = ev(['sibling#l.d']);
    expect(towerScope([here, child, grand, sibling], 'parent', desc)).toEqual([here, child, grand]);
  });

  it('keeps an event with one target outside and one inside the subtree', () => {
    const mixed = ev(['sibling#l.d', 'child#l.b']);
    expect(towerScope([mixed], 'parent', desc)).toEqual([mixed]);
  });

  it('drops every event when the tower has no descendants', () => {
    expect(towerScope([ev(['parent#l.a']), ev(['child#l.b'])], 'sibling', desc)).toEqual([]);
  });
});

describe('errorLayers', () => {
  const err = (targets: string[]) => ({ ...ev(targets), kind: 'error' as const });
  it('counts error events per layer of one tower and ignores other towers and non-errors', () => {
    const events = [err(['t#a.x']), err(['t#a.y']), err(['t#b.y']), ev(['t#a.z']), err(['u#a.x'])];
    expect(errorLayers(events, 't')).toEqual(new Map([['a', 2], ['b', 1]]));
  });
});

describe('foldRepeats', () => {
  const err = (targets: string[]) => ({ ...ev(targets), kind: 'error' as const });
  it('folds adjacent errors on the same target into one row keeping the first', () => {
    const first = err(['t#a.x']);
    const rows = [first, err(['t#a.x']), err(['t#a.x'])];
    const out = foldRepeats(rows);
    expect(out).toHaveLength(1);
    expect(out[0].n).toBe(3);
    expect(out[0].e).toBe(first);
  });
  it('does not fold errors on different targets', () => {
    expect(foldRepeats([err(['t#a.x']), err(['t#a.y'])]).map((r) => r.n)).toEqual([1, 1]);
  });
  it('does not fold non-errors', () => {
    expect(foldRepeats([ev(['t#a.x']), ev(['t#a.x'])]).map((r) => r.n)).toEqual([1, 1]);
  });
  it('does not fold unmapped errors', () => {
    expect(foldRepeats([err([]), err([])]).map((r) => r.n)).toEqual([1, 1]);
  });
});
