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
});
