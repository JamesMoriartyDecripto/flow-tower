import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';

/** The voice agent's tools on the real dev-squad tower (#63): answers must be true to the tower. */
describe('voice agent tools (#63)', () => {
  let run: typeof import('../src/app/voice/tools').runTool;
  let TOOLS: typeof import('../src/app/voice/tools').TOOLS;
  let useStore: typeof import('../src/app/store').useStore;
  const call = (name: string, args: Record<string, unknown> = {}) => JSON.parse(run(name, args));

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    // The scroll tool and the Hub panel dispatch DOM events: node has no window, so the tests provide one.
    vi.stubGlobal('window', new EventTarget());
    ({ useStore } = await import('../src/app/store'));
    ({ runTool: run, TOOLS } = await import('../src/app/voice/tools'));
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.getState().setWorkspace(workspace);
  });

  it('lists layers and the nodes of the second one', () => {
    expect(call('list_layers')[1]).toMatchObject({ number: 2, title: 'Orchestration' });
    const r = call('layer_nodes', { layer: 2 });
    expect(r.layer.title).toBe('Orchestration');
    expect(r.nodes.map((n: { key: string }) => n.key)).toContain('orchestration.lead');
    expect(call('layer_nodes', { layer: 'tools' }).layer.title).toBe('Tools & MCP');
  });

  it('answers about "this node" from the selection, and acts on screen', () => {
    expect(call('select_node', { node: 'triage' })).toMatchObject({ selected: 'Triage router', layer: 'Intake & Triage' });
    expect(useStore.getState().selected).toBe('intake.triage');
    const c = call('connections');
    expect(c.incoming.map((e: { from: { node: string } }) => e.from.node)).toContain('Webhook receiver');
    expect(c.outgoing.length).toBeGreaterThan(0);
    const files = call('node_files');
    expect(files.files[0]).toEqual({ number: 1, path: 'src/triage.ts' });
    expect(call('open_file', { index: 1 })).toEqual({ opened: 'src/triage.ts' });
    expect(useStore.getState().file).toMatchObject({ index: 0, files: ['src/triage.ts'] });
  });

  it('closes the open file and keeps the selection', () => {
    expect(call('select_node', { node: 'triage' })).toMatchObject({ selected: 'Triage router' });
    expect(call('open_file', { index: 1 })).toEqual({ opened: 'src/triage.ts' });
    expect(call('close_file')).toEqual({ closed: 'src/triage.ts' });
    expect(useStore.getState().file).toBeUndefined();
    expect(useStore.getState().selected).toBe('intake.triage');
    expect(call('close_file').error).toBe('No file is open.');
  });

  it('lists close_file among the tools', () => {
    expect(TOOLS.map((t) => t.function.name)).toContain('close_file');
  });

  it('lists the scroll_file and hub_panel tools (#145b)', () => {
    const names = TOOLS.map((t) => t.function.name);
    expect(names).toContain('scroll_file');
    expect(names).toContain('hub_panel');
  });

  it('lists compare_nodes among the tools (#145d)', () => {
    expect(TOOLS.map((t) => t.function.name)).toContain('compare_nodes');
  });

  it('compares two nodes side by side (#145d)', () => {
    useStore.getState().openFile(undefined);
    useStore.getState().showLibrary(false);
    useStore.getState().select(undefined);
    const r = call('compare_nodes', { a: 'lead', b: 'coder' });
    expect(r.a).toMatchObject({ label: 'Lead orchestrator', type: 'agent', layer: 'Orchestration', model: 'claude-opus-5-5', runtime: 'Squad container (container)' });
    expect(r.b).toMatchObject({ label: 'coder', type: 'agent', layer: 'Specialist Agents', model: 'anthropic/claude-haiku-5.5', runtime: 'Squad container (container)' });
    expect(r.a.files).toBe(3);
    expect(r.b.files).toBe(3);
    expect(r.a).toMatchObject({ incoming: 3, outgoing: 6 });
    expect(r.b).toMatchObject({ incoming: 5, outgoing: 3 });
    // Same fields are named, the differing ones are not.
    expect(r.same).toEqual(expect.arrayContaining(['type', 'runtime']));
    expect(r.same).not.toContain('label');
    expect(r.same).not.toContain('layer');
    expect(r.same).not.toContain('incoming');
    // Tools one has and the other has not, in both directions; Read/Grep/Glob are shared, so neither.
    expect(r.only_a).toEqual(expect.arrayContaining(['Agent', 'TodoWrite', 'mcp__squad__request_approval']));
    expect(r.only_b).toEqual(expect.arrayContaining(['Edit', 'Write', 'Bash', 'mcp__squad__run_tests']));
    expect(r.only_a).not.toContain('Read');
    expect(r.only_b).not.toContain('Grep');
    // A read tool: the view is untouched.
    expect(useStore.getState().file).toBeUndefined();
    expect(useStore.getState().library).toBe(false);
    expect(useStore.getState().selected).toBeUndefined();
  });

  it('reports a node compared with itself as fully equal (#145d)', () => {
    const r = call('compare_nodes', { a: 'triage', b: 'triage router' });
    expect(r.a).toEqual(r.b);
    expect(r.only_a).toEqual([]);
    expect(r.only_b).toEqual([]);
    expect(r.same).toEqual(expect.arrayContaining(['label', 'type', 'layer', 'tools', 'incoming', 'outgoing']));
  });

  it('names the node it cannot resolve (#145d)', () => {
    // The first node resolves; the error names the second, unresolved one.
    const r = call('compare_nodes', { a: 'triage', b: 'pizza' });
    expect(r.error).toMatch(/pizza/);
    expect(r.error).not.toMatch(/triage/);
    const both = call('compare_nodes', { a: 'pizza', b: 'triage' });
    expect(both.error).toMatch(/pizza/);
  });

  it('lists the filter_nodes and library_filter tools (#145c)', () => {
    const names = TOOLS.map((t) => t.function.name);
    expect(names).toContain('filter_nodes');
    expect(names).toContain('library_filter');
  });

  it('shows only some node types, and resets with an empty list (#145c)', () => {
    expect(call('filter_nodes', { types: ['agent', 'tool'] })).toEqual({ showing: ['agent', 'tool'] });
    expect([...useStore.getState().hiddenTypes].sort()).toEqual(
      ['decision', 'entry', 'guard', 'hook', 'human', 'memory', 'model', 'output', 'process']);
    expect(call('filter_nodes', { types: [] })).toEqual({ showing: 'every type' });
    expect(useStore.getState().hiddenTypes.size).toBe(0);
    // Absent list behaves like an empty one: everything back.
    expect(call('filter_nodes', { types: ['model'] })).toEqual({ showing: ['model'] });
    expect(call('filter_nodes')).toEqual({ showing: 'every type' });
    // Type names are the same words the parser knows, in both languages.
    expect(call('filter_nodes', { types: ['agenti'] })).toEqual({ showing: ['agent'] });
    // An invented type is refused, listing what is valid instead of showing nothing.
    // A refusal leaves the state alone: the set from the previous call is untouched.
    const before = [...useStore.getState().hiddenTypes].sort();
    const bad = call('filter_nodes', { types: ['pizza'] });
    expect(bad.error).toMatch(/pizza/);
    expect(bad.types).toContain('agent');
    expect([...useStore.getState().hiddenTypes].sort()).toEqual(before);
  });

  it('opens the library and filters it (#145c)', () => {
    const seen: unknown[] = [];
    window.addEventListener('flow-tower:library-filter', (e) => seen.push((e as CustomEvent<unknown>).detail));
    // The count is the one on screen: a query matching the project name finds it.
    expect(call('library_filter', { query: 'dev squad' })).toMatchObject({ projects: 1, query: 'dev squad' });
    expect(useStore.getState().library).toBe(true);
    // A query matching nothing is honest about it.
    expect(call('library_filter', { query: 'nothing here' }).projects).toBe(0);
    // The event carries both fields, so the panel sets the box and the tag together.
    expect(call('library_filter', { query: 'x', tag: 'coding' }).tag).toBe('coding');
    return new Promise<void>((done) => setTimeout(() => {
      expect(seen).toEqual([{ query: 'dev squad' }, { query: 'nothing here' }, { query: 'x', tag: 'coding' }]);
      done();
    }, 20));
  });

  it('never mutates the hidden set in place (#145c)', () => {
    useStore.getState().showOnlyTypes(['agent']);
    const first = useStore.getState().hiddenTypes;
    useStore.getState().showOnlyTypes(['tool']);
    const second = useStore.getState().hiddenTypes;
    expect(second).not.toBe(first);
    expect(first.has('tool')).toBe(true); // the earlier set is untouched
    useStore.getState().showOnlyTypes(undefined);
    expect(useStore.getState().hiddenTypes.size).toBe(0);
    expect(second.size).toBeGreaterThan(0); // replacing did not clear the old one either
  });

  it('filters through the same rule the panel uses (#145c)', async () => {
    const { matchingProjects } = await import('../src/app/library');
    const ws = useStore.getState().workspace!;
    expect(matchingProjects(ws, {})).toEqual(ws.projects);
    expect(matchingProjects(ws, { tag: 'pizza' })).toEqual([]);
    expect(matchingProjects(ws, { tag: 'coding' })).toEqual(ws.projects);
  });

  it('scrolls the open file by dispatching the viewer event (#145b)', () => {
    const seen: string[] = [];
    window.addEventListener('flow-tower:viewer-scroll', (e) => seen.push((e as CustomEvent<string>).detail));
    // No file open: the tool says so and dispatches nothing.
    useStore.getState().openFile(undefined);
    expect(call('scroll_file', { to: 'down' }).error).toMatch(/No file is open/);
    expect(seen).toEqual([]);
    useStore.getState().openFile({ tower: 'dev-squad/dev-squad.tower.yaml', files: ['a.ts'], index: 0 });
    expect(call('scroll_file', { to: 'bottom' })).toEqual({ scrolled: 'bottom' });
    expect(seen).toEqual(['bottom']);
    expect(call('scroll_file', { to: 'sideways' }).error).toMatch(/sideways/);
    expect(seen).toEqual(['bottom']);
    useStore.getState().openFile(undefined);
  });

  it('drives the Hub panel store (#145b)', async () => {
    const { useHub } = await import('../src/app/hud/Hub');
    useHub.getState().setMe({ hub: true, readOnly: false, online: 1, tokens: 2 });
    expect(call('hub_panel', { tab: 'machines' })).toEqual({ shown: 'machines' });
    expect(useHub.getState()).toMatchObject({ open: true, tab: 'machines' });
    expect(call('hub_panel', { tab: 'close' })).toEqual({ closed: true });
    expect(useHub.getState().open).toBe(false);
    // Not on a hub: opening is refused, closing is not.
    useHub.getState().setMe({ hub: false, readOnly: false, online: 0, tokens: 0 });
    expect(call('hub_panel', { tab: 'now' }).error).toMatch(/not on a hub/);
    expect(useHub.getState().open).toBe(false);
    expect(call('hub_panel', { tab: 'close' })).toEqual({ closed: true });
  });

  it('searches the whole tower', () => {
    const r = call('search', { query: 'MCP' });
    expect(r.count).toBeGreaterThanOrEqual(5);
    expect(r.nodes.map((n: { label: string }) => n.label)).toContain('GitHub MCP');
  });

  it('returns errors the model can recover from', () => {
    expect(call('layer_nodes', { layer: 42 }).error).toMatch(/list_layers/);
    expect(call('open_file', { node: 'triage', index: 9 }).error).toMatch(/file/);
    expect(call('open_project', { name: 'pizza' }).projects).toContain('Dev Squad');
  });

  it('sets the list on search and reports it from screen (#130)', () => {
    const r = call('search', { query: 'MCP' });
    // Cursor at -1 (nothing stepped yet): the count is known, the position is not.
    expect(call('screen').list).toEqual({ source: 'search', count: r.count });
  });

  it('moves the cursor when a listed node is selected (#130)', () => {
    const r = call('search', { query: 'MCP' });
    const key = r.nodes[2].key;
    expect(call('select_node', { node: key })).toMatchObject({ selected: r.nodes[2].label });
    expect(call('screen').list).toMatchObject({ source: 'search', count: r.count, position: 3 });
  });

  it('sets a layer list in flow order on layer_nodes (#130)', () => {
    const r = call('layer_nodes', { layer: 2 });
    const keys = r.nodes.map((n: { key: string }) => n.key);
    expect(call('screen').list).toEqual({ source: 'layer', count: keys.length });
    expect(call('select_node', { node: keys[1] })).toMatchObject({ selected: r.nodes[1].label });
    expect(call('screen').list).toMatchObject({ source: 'layer', position: 2 });
  });
});
