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

  it('applies at most the last 300 events of a host batch', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.setState({ workspace });
    const node = Object.values(workspace.towers)[0].layers[0].nodes[0].key;
    useLive.setState({ events: [] });
    const batch = Array.from({ length: 301 }, () => ({ kind: 'tool.start', node }));

    expect(ingest(batch)).toBe(300);
    expect(useLive.getState().events).toHaveLength(300);
    // The feed is full now; empty it so later tests start from a known state.
    useLive.setState({ events: [] });
  });

  it('clamps a future host ts to now and keeps a past ts', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.setState({ workspace });
    const node = Object.values(workspace.towers)[0].layers[0].nodes[0].key;
    useLive.setState({ events: [] });
    const past = Date.now() - 60_000;

    ingest([
      { kind: 'tool.start', node, ts: Date.now() + 3_600_000 },
      { kind: 'tool.start', node, ts: past },
    ]);

    const [future, old] = useLive.getState().events;
    expect(future.ts).toBeLessThanOrEqual(Date.now());
    expect(old.ts).toBe(past);
  });
});

describe('window.flowTowerEmbed (#444)', () => {
  let embedApi: typeof import('../src/app/embed').embedApi;
  let useStore: typeof import('../src/app/store').useStore;
  let useLive: typeof import('../src/app/live').useLive;

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '' });
    ({ useStore } = await import('../src/app/store'));
    ({ useLive } = await import('../src/app/live'));
    ({ embedApi } = await import('../src/app/embed'));
  });

  it('apply ignores a value that is not an array', () => {
    expect(embedApi().apply('x' as never)).toBe(0);
  });

  it('apply adds a valid event to the live feed', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.setState({ workspace });
    const node = Object.values(workspace.towers)[0].layers[0].nodes[0].key;
    const before = useLive.getState().events.length;

    expect(embedApi().apply([{ kind: 'tool.start', node }])).toBe(1);

    expect(useLive.getState().events.slice(before)).toHaveLength(1);
  });

  it('open ignores an unknown id', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.setState({ workspace });
    const { stack } = useStore.getState();

    embedApi().open('missing');

    expect(useStore.getState().stack).toBe(stack);
  });

  it('open ignores inherited object keys', async () => {
    const { workspace } = await loadLibrary(['examples/dev-squad']);
    useStore.setState({ workspace });
    const { stack } = useStore.getState();

    embedApi().open('constructor');
    embedApi().open('__proto__');

    expect(useStore.getState().stack).toBe(stack);
  });
});
