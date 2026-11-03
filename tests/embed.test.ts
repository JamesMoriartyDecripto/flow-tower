import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { resolveTargets } from '../src/core/events';

describe('embed flags (#444)', () => {
  let embedFlags: typeof import('../src/app/staticData').embedFlags;

  beforeAll(async () => {
    ({ embedFlags } = await import('../src/app/staticData'));
  });

  it('embeds a static build on ?embed=1 and keeps the chrome', () => {
    expect(embedFlags('?embed=1', true)).toEqual({ embed: true, chrome: true });
  });

  it('hides the chrome only with chrome=0 on an embed', () => {
    expect(embedFlags('?embed=1&chrome=0', true)).toEqual({ embed: true, chrome: false });
    expect(embedFlags('?chrome=0', true)).toEqual({ embed: false, chrome: true });
  });

  it('never embeds outside the static build', () => {
    expect(embedFlags('?embed=1', false)).toEqual({ embed: false, chrome: true });
  });
});

describe('ingest (#444)', () => {
  let ingest: typeof import('../src/app/demo').ingest;
  let useStore: typeof import('../src/app/store').useStore;
  let useLive: typeof import('../src/app/live').useLive;

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ useStore } = await import('../src/app/store'));
    ({ useLive } = await import('../src/app/live'));
    ({ ingest } = await import('../src/app/demo'));
  });

  it('recomputes targets against the workspace and assigns a fresh id', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.setState({ workspace });
    const tower = Object.values(workspace.towers)[0];
    const node = tower.layers[0].nodes[0].key;
    const before = useLive.getState().events.length;

    expect(ingest([{ kind: 'tool.start', node, targets: ['bogus#x'], id: 999 }])).toBe(1);

    const added = useLive.getState().events.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0].targets).not.toContain('bogus#x');
    expect(added[0].targets).toEqual(resolveTargets(workspace, added[0]));
    expect(added[0].id).not.toBe(999);
  });

  it('drops an invalid event', () => {
    expect(ingest([{ kind: 'nope' }])).toBe(0);
  });

  it('applies nothing without a workspace', () => {
    useStore.setState({ workspace: undefined });
    expect(ingest([{ kind: 'tool.start' }])).toBe(0);
  });
});
