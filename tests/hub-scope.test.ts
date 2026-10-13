import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowEventSchema, resolveTargets } from '../src/core/events.ts';
import type { ResolvedTower, Workspace } from '../src/core/types.ts';
import { callAdmin } from '../src/app/hud/hubAdminApi.ts';

/** A one-node tower whose only node answers to `tool:bash`, so each tower lights on the same events. */
function bashTower(id: string): ResolvedTower {
  const node = { key: 'run', id: 'run', label: 'run', match: ['tool:bash'] };
  return {
    id, name: id, tags: [], runtimes: {}, links: [], issues: [],
    layers: [{ id: 'l', index: 0, title: 'l', nodes: [node], edges: [] }],
  } as unknown as ResolvedTower;
}

/** Three projects: two machines (a, b) and this hub's own (h). Each project is one tower of the same name. */
function hubWorkspace(withSources: boolean): Workspace {
  const towers = { pa: bashTower('pa'), pb: bashTower('pb'), ph: bashTower('ph') };
  return {
    projects: ['pa', 'pb', 'ph'],
    towers,
    loadedAt: '2025-01-01T00:00:00.000Z',
    ...(withSources ? { sources: { pa: 'a', pb: 'b', ph: 'local' } } : {}),
  } as Workspace;
}

const bash = FlowEventSchema.parse({ kind: 'tool.start', tool: 'bash' });
const towersOf = (targets: string[]) => [...new Set(targets.map((t) => t.split('#')[0]))].sort();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callAdmin on body-less mutations', () => {
  it('sends a JSON content type and an empty object on a POST with no body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await callAdmin('POST', '/senders/box-1/pause');

    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/hub/admin/senders/box-1/pause');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{}');
  });

  it('keeps a given body as it is', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await callAdmin('PUT', '/viewers', { viewers: ['ann'] });

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe('{"viewers":["ann"]}');
  });

  it('sends no body on a GET', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ senders: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await callAdmin('GET', '');

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });
});

describe('resolveTargets scoped to a sender on a hub', () => {
  it('lands a machine A event only on its own tower and the hub tower', () => {
    const targets = resolveTargets(hubWorkspace(true), bash, { sender: 'a' });
    expect(towersOf(targets)).toEqual(['pa', 'ph']);
  });

  it('keeps the other machine out of it, whichever machine sent it', () => {
    expect(towersOf(resolveTargets(hubWorkspace(true), bash, { sender: 'b' }))).toEqual(['pb', 'ph']);
  });

  it('lets an event that names a tower reach that tower, even another machine\'s', () => {
    const named = FlowEventSchema.parse({ kind: 'tool.start', tool: 'bash', tower: 'pb' });
    expect(towersOf(resolveTargets(hubWorkspace(true), named, { sender: 'a' }))).toEqual(['pb']);
  });

  it('changes nothing without sources (a plain or satellite server)', () => {
    const ws = hubWorkspace(false);
    expect(towersOf(resolveTargets(ws, bash, { sender: 'a' }))).toEqual(['pa', 'pb', 'ph']);
    expect(resolveTargets(ws, bash, { sender: 'a' })).toEqual(resolveTargets(ws, bash));
  });

  it('changes nothing for a local event on the hub (no sender)', () => {
    expect(towersOf(resolveTargets(hubWorkspace(true), bash))).toEqual(['pa', 'pb', 'ph']);
  });
});
