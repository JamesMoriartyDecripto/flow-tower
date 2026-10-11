import { describe, expect, it } from 'vitest';
import { ago, hubPill, machineState, nowRows, IDLE_MS, RUN_MS } from '../src/app/hub';
import { FlowEventSchema, type FlowEvent } from '../src/core/events';

/** A parsed event with the server-filled fields, like the live store holds (#82). */
const ev = (x: Record<string, unknown>, ts = 0): FlowEvent =>
  ({ ...FlowEventSchema.parse({ kind: 'log', ...x }), id: 1, ts, targets: [] }) as FlowEvent;

const NOW = 1_000_000_000;

describe('Now rows (#92)', () => {
  it('groups one row per machine, runtime, project and starter, counting the events', () => {
    const events = [
      ev({ source: 'claude-code', host: 'laptop', project: 'flow-tower', user: 'dana' }, NOW - 1_000),
      ev({ source: 'claude-code', host: 'laptop', project: 'flow-tower', user: 'dana' }, NOW - 500),
      ev({ source: 'codex', host: 'vps', project: 'api', user: 'bob' }, NOW - 2_000),
    ];
    const rows = nowRows(events, NOW);
    expect(rows).toHaveLength(2);
    const dana = rows.find((r) => r.machine === 'laptop')!;
    expect(dana).toMatchObject({ runtime: 'claude-code', project: 'flow-tower', startedBy: 'dana', count: 2, last: NOW - 500 });
    expect(rows.find((r) => r.machine === 'vps')).toMatchObject({ runtime: 'codex', project: 'api', startedBy: 'bob', count: 1 });
  });

  it('falls back to sender then "local", runtime then source, and "–" for a missing project', () => {
    const [row] = nowRows([ev({ sender: 'dana', runtime: 'claude-code' }, NOW)], NOW);
    expect(row).toMatchObject({ machine: 'dana', runtime: 'claude-code', project: '–' });
    // The very last fallback: no host and no sender is a local run.
    const [bare] = nowRows([ev({ source: 'custom', user: 'dana' }, NOW)], NOW);
    expect(bare.machine).toBe('local');
  });

  it('marks a run with no user as AUTO', () => {
    const events = [ev({ source: 'custom', host: 'h', project: 'p' }, NOW - 10)];
    expect(nowRows(events, NOW)[0].startedBy).toBe('AUTO');
  });

  it('marks a scheduled or CI runtime as AUTO even when a user is set', () => {
    const cron = ev({ host: 'h', project: 'p', user: 'dana', runtime: 'cron' }, NOW);
    const ci = ev({ host: 'h', project: 'p', user: 'dana', source: 'github-actions' }, NOW);
    const skip = ev({ host: 'h2', project: 'p', user: 'dana', source: 'event' }, NOW);
    expect(nowRows([cron], NOW)[0].startedBy).toBe('AUTO');
    expect(nowRows([ci], NOW)[0].startedBy).toBe('AUTO');
    // A human source that merely contains no keyword stays the user.
    expect(nowRows([skip], NOW)[0].startedBy).toBe('dana');
  });

  it('reads the three states off the thresholds, with the boundaries inside the tighter state', () => {
    const at = (age: number) => nowRows([ev({ host: 'h', source: 's', project: 'p' }, NOW - age)], NOW)[0].state;
    expect(at(RUN_MS - 1)).toBe('run');
    expect(at(RUN_MS)).toBe('idle');
    expect(at(IDLE_MS - 1)).toBe('idle');
    expect(at(IDLE_MS)).toBe('silent');
    expect(RUN_MS).toBe(120_000);
    expect(IDLE_MS).toBe(900_000);
  });

  it('sorts run, then idle, then silent, and newest first inside each state', () => {
    const rows = nowRows(
      [
        ev({ host: 'silent', source: 's', project: 'p' }, NOW - IDLE_MS - 1),
        ev({ host: 'older-run', source: 's', project: 'p' }, NOW - 90_000),
        ev({ host: 'newer-run', source: 's', project: 'p' }, NOW - 1_000),
        ev({ host: 'idle', source: 's', project: 'p' }, NOW - RUN_MS - 1),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.machine, r.state])).toEqual([
      ['newer-run', 'run'], ['older-run', 'run'], ['idle', 'idle'], ['silent', 'silent'],
    ]);
  });

  it('never copies a message, data or tool argument into a row', () => {
    const secret = 'rm -rf /home/dana/private';
    const event = ev({
      host: 'h', source: 's', project: 'p', user: 'dana',
      message: secret, tool: 'Bash', data: { command: secret }, agent: secret,
    }, NOW);
    const row = nowRows([event], NOW)[0];
    // The row is only what the spec allows: enumerating the keys proves nothing leaked.
    expect(Object.keys(row).sort()).toEqual(['count', 'last', 'machine', 'project', 'runtime', 'startedBy', 'state']);
    expect(JSON.stringify(row)).not.toContain(secret);
  });
});

describe('Now auxiliaries (#92)', () => {
  it('formats an age floored, in the largest unit under a day', () => {
    expect(ago(12_000)).toBe('12 s');
    expect(ago(59_999)).toBe('59 s');
    expect(ago(60_000)).toBe('1 m');
    expect(ago(4 * 60_000 + 59_000)).toBe('4 m');
    expect(ago(3 * 3_600_000)).toBe('3 h');
    expect(ago(41 * 86_400_000)).toBe('41 d');
    // A future time (a skewed clock) must not print a negative age.
    expect(ago(-5_000)).toBe('0 s');
  });

  it('shows the HUB n/m pill only on a hub', () => {
    expect(hubPill({ hub: true, online: 4, tokens: 5 })).toBe('HUB 4/5');
    expect(hubPill({ hub: false, online: 4, tokens: 5 })).toBeUndefined();
    expect(hubPill(undefined)).toBeUndefined();
  });

  it('gives each Machines state its dot and word', () => {
    expect(machineState({ state: 'revoked', online: false })).toEqual({ dot: '✕', label: 'revoked' });
    expect(machineState({ state: 'paused', online: false })).toEqual({ dot: '✕', label: 'paused' });
    expect(machineState({ state: 'active', online: true })).toEqual({ dot: '●', label: 'active' });
    // A satellite known only from its events: seen, but not online right now.
    expect(machineState({ state: 'unknown', online: false })).toEqual({ dot: '○', label: 'silent' });
    // An active token we have never heard from.
    expect(machineState({ state: 'active', online: false })).toEqual({ dot: '○', label: 'never' });
  });
});

