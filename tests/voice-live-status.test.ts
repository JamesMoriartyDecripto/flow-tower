import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FlowEvent } from '../src/core/events';
import { loadLibrary } from '../src/core/loader';
import type { NodeLive } from '../src/app/live';
import type { Workspace } from '../src/core/types';

/** "Cosa sta succedendo?" (#160a): the live summary is a pure function of events and node state, with a fake clock. */
describe('voice live status (#160a)', () => {
  let ws: Workspace;
  let liveStatus: typeof import('../src/app/voice/live-status').liveStatus;
  let WINDOW_MS: number;
  let TOWER = '';
  const NOW = 10_000_000_000;

  beforeAll(async () => {
    // findNode lives in store.ts, which reads `location` when it loads: stub it as the other voice test does.
    vi.stubGlobal('location', { search: '' });
    ({ liveStatus, WINDOW_MS } = await import('../src/app/voice/live-status'));
    ({ workspace: ws } = await loadLibrary(['examples/dev-squad']));
    // The id is whatever the loader gives the project's tower: not hard-coded here.
    TOWER = ws.projects[0];
  });

  let id = 0;
  const event = (over: Partial<FlowEvent> & { kind: FlowEvent['kind']; ts: number }, targets: string[] = []): FlowEvent =>
    ({ id: ++id, source: 'custom', targets, ...over }) as FlowEvent;
  const node = (over: Partial<NodeLive> = {}): NodeLive => ({ open: 0, lastTs: 0, errorTs: 0, doneTs: 0, count: 0, ...over });
  const run = (over: Partial<Parameters<typeof liveStatus>[0]> = {}) =>
    liveStatus({ events: [], nodes: new Map(), ws, towerId: TOWER, hub: false, now: NOW, ...over });

  it('lists only the errors inside the window, newest first, and marks the one on screen', () => {
    const nodes = new Map<string, NodeLive>([
      [`${TOWER}#intake.triage`, node({ errorTs: NOW - 30_000, lastTs: NOW - 30_000, last: event({ kind: 'tool.end', ts: NOW - 30_000, tool: 'Bash' }, []) })],
      [`${TOWER}#intake.issue`, node({ errorTs: NOW - 20 * 60_000 })],
    ]);
    const r = run({ nodes });
    expect(r.errors.map((e) => e.key)).toEqual(['intake.triage']);
    expect(r.errors[0]).toMatchObject({ node: 'Triage', on_screen: true, ago: '30 s', kind: 'tool.end', tool: 'Bash' });
    expect(r.newest_error).toBe(r.errors[0]);
    expect(run({ nodes, towerId: 'elsewhere.yaml' }).errors[0].on_screen).toBe(false);
  });

  it('keeps the newest errors first, up to five', () => {
    const nodes = new Map<string, NodeLive>();
    const keys = ws.towers[TOWER].layers.flatMap((l) => l.nodes).slice(0, 7);
    keys.forEach((n, i) => nodes.set(`${TOWER}#${n.key}`, node({ errorTs: NOW - (i + 1) * 1000 })));
    const r = run({ nodes });
    expect(r.errors).toHaveLength(5);
    expect(r.errors[0].key).toBe(keys[0].key);
  });

  it('lists a node running with an open start, and not a stale one', () => {
    const nodes = new Map<string, NodeLive>([
      [`${TOWER}#intake.triage`, node({ open: 1, lastTs: NOW - 10_000 })],
      [`${TOWER}#intake.issue`, node({ open: 1, lastTs: NOW - 5 * 60_000 })],
    ]);
    const r = run({ nodes });
    expect(r.running).toEqual([expect.objectContaining({ key: 'intake.triage', node: 'Triage', since: '10 s', on_screen: true })]);
  });

  it('is quiet with no events in the window', () => {
    expect(run()).toEqual({ quiet: true, events: 0, errors: [], running: [], busiest: [], newest_error: undefined });
    const old = [event({ kind: 'log', ts: NOW - WINDOW_MS - 1, targets: [`${TOWER}#intake.triage`] }, [])];
    expect(run({ events: old })).toMatchObject({ quiet: true, events: 0, busiest: [] });
  });

  it('ranks the busiest nodes by window events, ties by label, and omits hub unless asked', () => {
    const a = `${TOWER}#intake.triage`;
    const b = `${TOWER}#intake.issue`;
    const events = [
      event({ kind: 'log', ts: NOW - 1000, targets: [a] }),
      event({ kind: 'log', ts: NOW - 2000, targets: [a, b] }),
      event({ kind: 'log', ts: NOW - 3000, targets: [b] }),
    ];
    const r = run({ events });
    expect(r.quiet).toBe(false);
    expect(r.events).toBe(3);
    // Both nodes have two events: the label breaks the tie ("GitHub issue" < "Triage").
    expect(r.busiest.map((x) => [x.node, x.events])).toEqual([['GitHub issue', 2], ['Triage', 2]]);
    expect(r.busiest.length).toBeLessThanOrEqual(3);
    expect(r).not.toHaveProperty('hub');
  });

  it('reports hub machines: running now, silent when last heard long ago', () => {
    const t = `${TOWER}#intake.triage`;
    const events = [
      event({ kind: 'log', ts: NOW - 5_000, targets: [t], host: 'mac-a' }),
      event({ kind: 'log', ts: NOW - 60 * 60_000, targets: [t], host: 'mac-b' }),
    ];
    const r = run({ events, hub: true });
    expect(r.hub?.running).toEqual(['mac-a']);
    expect(r.hub?.silent).toEqual(['mac-b']);
  });

  it('never carries free text from an event into the summary', () => {
    const t = `${TOWER}#intake.triage`;
    const events = [event({ kind: 'error', ts: NOW - 1000, status: 'error', message: 'SECRET-MARKER', data: { x: 'SECRET-MARKER' }, targets: [t] }, [])];
    const nodes = new Map<string, NodeLive>([[t, node({ errorTs: NOW - 1000, lastTs: NOW - 1000, last: events[0] })]]);
    const r = run({ events, nodes, hub: true });
    expect(JSON.stringify(r)).not.toContain('SECRET-MARKER');
  });

  it('skips targets whose tower or node is not in the workspace', () => {
    const nodes = new Map<string, NodeLive>([
      ['ghost.tower#intake.triage', node({ errorTs: NOW - 1000 })],
      [`${TOWER}#nope.nothing`, node({ errorTs: NOW - 1000 })],
    ]);
    const events = [event({ kind: 'log', ts: NOW - 1000, targets: ['ghost.tower#intake.triage'] }, [])];
    const r = run({ nodes, events });
    expect(r.errors).toEqual([]);
    expect(r.busiest).toEqual([]);
    expect(r.newest_error).toBeUndefined();
  });
});
