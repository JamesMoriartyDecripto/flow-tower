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
const { descendants, towerScope } = await import('../src/app/live');
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
