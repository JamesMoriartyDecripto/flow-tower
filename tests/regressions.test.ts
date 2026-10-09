import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eventMatches, FlowEventSchema, resolveTargets, splitTarget } from '../src/core/events';
import { loadLibrary } from '../src/core/loader';
import type { Workspace } from '../src/core/types';

/** Bugs found by the v0.1.0 release audit (examples/release-auditor/reports/v0.1.0.md). */

const dir = () => mkdtempSync(join(tmpdir(), 'flow-tower-reg-'));
const layer = (nodes: string) => `layers:\n  - id: l\n    title: L\n    nodes: ${nodes}\n`;

describe('loader', () => {
  it('keeps towers that reference each other in the library', async () => {
    const d = dir();
    writeFileSync(join(d, 'a.tower.yaml'), `name: A\n${layer('[{ id: n, tower: b.tower.yaml }]')}`);
    writeFileSync(join(d, 'b.tower.yaml'), `name: B\n${layer('[{ id: n, tower: a.tower.yaml }]')}`);
    const { workspace } = await loadLibrary([d]);
    expect(workspace.projects.length).toBeGreaterThan(0);
  });

  it('a non-string name in agent frontmatter does not break live events or search', async () => {
    const d = dir();
    writeFileSync(join(d, 'coder.md'), '---\nname: 2025\ndescription: 42\nmodel: 4\n---\nYou code.');
    writeFileSync(join(d, 't.tower.yaml'), `name: T\nagents:\n  coder: { from: coder.md }\n${layer('[{ id: n, agent: coder }]')}`);
    const { workspace } = await loadLibrary([d]);
    const node = workspace.towers['t.tower.yaml'].layers[0].nodes[0];
    expect(node.label).toBe('2025');
    expect(node.agent?.description).toBe('42');
    const event = FlowEventSchema.parse({ kind: 'tool.start', agent: 'x', tool: 'Bash' });
    expect(() => resolveTargets(workspace as Workspace, event)).not.toThrow();
    expect(eventMatches(node, FlowEventSchema.parse({ kind: 'agent.start', agent: '2025' }))).toBe(true);
  });
});

describe('navigation state', () => {
  let useStore: typeof import('../src/app/store').useStore;
  let ws: Workspace;

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ useStore } = await import('../src/app/store'));
    const d = dir();
    writeFileSync(join(d, 'sub.tower.yaml'), `name: Sub\nruntimes:\n  gpu: { kind: cloud }\n${layer('[{ id: g, runtime: gpu }]')}`);
    writeFileSync(join(d, 'main.tower.yaml'), [
      'name: Main',
      'agents:',
      '  dev: { tower: sub.tower.yaml }',
      'layers:',
      '  - id: l',
      '    title: L',
      '    nodes: [{ id: plain }, { id: owner, tower: sub.tower.yaml }, { id: gameplay, agent: dev }, { id: netcode, agent: dev }]',
      '  - id: m',
      '    title: M',
      '    nodes: [{ id: y }]',
    ].join('\n'));
    ({ workspace: ws } = await loadLibrary([join(d, 'main.tower.yaml')]));
  });

  it('clicking the current tower in the breadcrumb keeps the selection', () => {
    const s = useStore.getState();
    s.setWorkspace(ws);
    s.openProject('main.tower.yaml');
    s.focusLayer(1);
    s.select('m.y');
    useStore.getState().goTo(0);
    expect(useStore.getState().selected).toBe('m.y');
  });

  it('the runtime spotlight of a sub-tower does not follow the user back up', () => {
    const s = useStore.getState();
    s.openProject('main.tower.yaml');
    s.enterTower('sub.tower.yaml');
    useStore.getState().set({ runtimeFocus: 'gpu' });
    useStore.getState().goTo(0);
    expect(useStore.getState().runtimeFocus).toBeUndefined();
    useStore.getState().set({ runtimeFocus: 'gpu' });
    useStore.getState().openPath(['main.tower.yaml']);
    expect(useStore.getState().runtimeFocus).toBeUndefined();
  });

  it('a live reload that removes the selected node or layer clears them', () => {
    const s = useStore.getState();
    s.openProject('main.tower.yaml');
    s.focusLayer(1);
    s.select('m.y');
    const main = ws.towers['main.tower.yaml'];
    useStore.getState().setWorkspace({ ...ws, towers: { ...ws.towers, 'main.tower.yaml': { ...main, layers: main.layers.slice(0, 1) } } });
    expect(useStore.getState()).toMatchObject({ selected: undefined, focusedLayer: undefined });
  });

  it('coming back up lands on the node the user entered from, even if several share the sub-tower', () => {
    const s = useStore.getState();
    s.openProject('main.tower.yaml');
    s.select('l.netcode');
    s.enterTower('sub.tower.yaml');
    useStore.getState().goTo(0);
    expect(useStore.getState().selected).toBe('l.netcode');
  });

  it('arrows still move when the selected node type is hidden', async () => {
    const { navigate, publishLayout } = await import('../src/app/keynav');
    const main = ws.towers['main.tower.yaml'];
    const box = (key: string, x: number) => ({ key, x, z: 0, w: 2, d: 1 });
    publishLayout(main.id, { layers: [{ nodes: { 'l.plain': box('l.plain', 0), 'l.owner': box('l.owner', 4), 'l.gameplay': box('l.gameplay', 8), 'l.netcode': box('l.netcode', 12) }, edges: [] }] } as never);
    const s = useStore.getState();
    s.openProject('main.tower.yaml');
    s.focusLayer(0);
    s.select('l.gameplay');
    s.toggleType('agent'); // gameplay and netcode are agents
    navigate(main, 'left');
    expect(useStore.getState().selected).toBe('l.owner');
    useStore.getState().toggleType('agent');
  });
});

describe('live reload', () => {
  it('keeps unchanged towers as the same objects, so their layout is not recomputed', async () => {
    vi.stubGlobal('location', { search: '' });
    const { useStore } = await import('../src/app/store');
    const d = dir();
    writeFileSync(join(d, 'a.tower.yaml'), `name: A\n${layer('[{ id: n }]')}`);
    writeFileSync(join(d, 'b.tower.yaml'), `name: B\n${layer('[{ id: n }]')}`);
    const first = (await loadLibrary([d])).workspace;
    useStore.getState().setWorkspace(first);
    writeFileSync(join(d, 'b.tower.yaml'), `name: B2\n${layer('[{ id: n }]')}`);
    useStore.getState().setWorkspace((await loadLibrary([d])).workspace);
    const now = useStore.getState().workspace!;
    expect(now.towers['a.tower.yaml']).toBe(first.towers['a.tower.yaml']);
    expect(now.towers['b.tower.yaml'].name).toBe('B2');
  });
});

describe('live feed', () => {
  it('the initial fetch arriving after a pushed event does not duplicate events', async () => {
    vi.stubGlobal('location', { search: '' });
    const { useLive } = await import('../src/app/live');
    const ev = (id: number) => ({ id, ts: id, kind: 'log' as const, source: 't', targets: [] });
    useLive.getState().clear();
    useLive.setState({ lastId: 0 });
    useLive.getState().apply([ev(205), ev(206), ev(207)]); // pushed over the websocket first
    useLive.getState().apply([ev(204), ev(205), ev(206)], true); // then the initial GET resolves
    const ids = useLive.getState().events.map((e) => e.id);
    expect(ids).toEqual([204, 205, 206, 207]);
  });

  it('usage older than the feed window is counted once, even when the initial fetch runs twice', async () => {
    vi.stubGlobal('location', { search: '' });
    const { useLive, usageOf } = await import('../src/app/live');
    useLive.getState().clear();
    useLive.setState({ lastId: 0, firstId: Infinity });
    const usage = (id: number) => ({ id, ts: id, kind: 'usage' as const, source: 't', tokens: 10, cost_usd: 0.01, targets: ['t#l.n'] });
    const buffer = Array.from({ length: 500 }, (_, i) => usage(i + 1)); // more than the 300 the feed keeps
    useLive.getState().apply(buffer, true);
    useLive.getState().apply(buffer, true); // React StrictMode runs the effect twice in development
    expect(usageOf(useLive.getState().usage, new Set(['t']))?.calls).toBe(500);
  });
});

describe('live targets', () => {
  it('split on the last #, since tower ids are paths and may contain one', () => {
    expect(splitTarget('c#-agents/x.tower.yaml#core.step')).toEqual(['c#-agents/x.tower.yaml', 'core.step']);
  });
});
