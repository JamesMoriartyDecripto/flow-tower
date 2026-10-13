import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelaySupervisor, type RelayReading, type RelaySettings } from '../src/server/relay-supervisor.ts';

// A token the log must never show: the tests assert it stays out of every line.
const TOKEN = 'ft_supervisor_secret_123';

interface FakeRelay {
  setCredentials: (creds: { url: string; token?: string }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}
type Spy = ReturnType<typeof vi.fn<(...args: never[]) => unknown>>;

function setup(initial: RelayReading) {
  let reading: RelayReading = initial;
  const logs: string[] = [];
  const built: { settings: RelaySettings; relay: { setCredentials: Spy; stop: Spy } }[] = [];
  const syncs: { stop: Spy }[] = [];
  const read = vi.fn(() => reading);
  const build = vi.fn((settings: RelaySettings, _onStateChange: unknown) => {
    const relay = { setCredentials: vi.fn(), stop: vi.fn() };
    built.push({ settings, relay });
    return relay as unknown as FakeRelay;
  });
  const startSync = vi.fn((settings: RelaySettings) => {
    if (!settings.token) return undefined;
    const sync = { stop: vi.fn() };
    syncs.push(sync);
    return sync as never;
  });
  const supervisor = createRelaySupervisor({ read, build, startSync, log: (m) => logs.push(m), intervalMs: 1_000 });
  return {
    supervisor,
    logs,
    built,
    syncs,
    build,
    startSync,
    set: (next: RelayReading) => { reading = next; },
  };
}

const satellite = (over: Partial<RelayReading> = {}): RelayReading => ({
  role: 'satellite', url: 'http://hub.example:5317', token: TOKEN, user: 'alice', machine: 'laptop', paused: false, allowed: true, ...over,
});
const local: RelayReading = { role: 'local', paused: false, allowed: true };

describe('relay supervisor (#91, #164)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('builds the relay once and starts the sync when a local server becomes a satellite', () => {
    const t = setup(local);
    expect(t.build).not.toHaveBeenCalled();
    expect(t.supervisor.current()).toBeUndefined();

    t.set(satellite());
    vi.advanceTimersByTime(1_000);
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(t.startSync).toHaveBeenCalledTimes(1);
    expect(t.supervisor.current()).toBeDefined();
    expect(t.supervisor.sync()).toBeDefined();

    // More ticks with no change: no second build, no second sync.
    vi.advanceTimersByTime(5_000);
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(t.startSync).toHaveBeenCalledTimes(1);
    t.supervisor.stop();
  });

  it('calls setCredentials on a token change and keeps the same relay', () => {
    const t = setup(satellite());
    const first = t.supervisor.current();
    expect(t.build).toHaveBeenCalledTimes(1);

    t.set(satellite({ token: 'ft_rotated_token_456' }));
    vi.advanceTimersByTime(1_000);
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(t.supervisor.current()).toBe(first);
    expect(t.built[0].relay.setCredentials).toHaveBeenCalledWith({ url: 'http://hub.example:5317', token: 'ft_rotated_token_456' });
    t.supervisor.stop();
  });

  it('rebuilds the relay when the machine name changes', () => {
    const t = setup(satellite());
    t.set(satellite({ machine: 'desktop' }));
    vi.advanceTimersByTime(1_000);
    expect(t.build).toHaveBeenCalledTimes(2);
    expect(t.built[0].relay.stop).toHaveBeenCalled();
    expect(t.built[1].settings.machine).toBe('desktop');
    t.supervisor.stop();
  });

  it('stops the relay and the sync when a satellite goes back to local', () => {
    const t = setup(satellite());
    const relay = t.built[0].relay;
    const sync = t.syncs[0];

    t.set(local);
    vi.advanceTimersByTime(1_000);
    expect(relay.stop).toHaveBeenCalledTimes(1);
    expect(sync.stop).toHaveBeenCalledTimes(1);
    expect(t.supervisor.current()).toBeUndefined();
    expect(t.supervisor.sync()).toBeUndefined();
    expect(t.logs).toContain('flow-tower: sharing stopped (not a satellite)');
    t.supervisor.stop();
  });

  it('stops everything when the server is not allowed to relay (a hub)', () => {
    const t = setup(satellite());
    t.set(satellite({ allowed: false }));
    vi.advanceTimersByTime(1_000);
    expect(t.supervisor.current()).toBeUndefined();
    t.supervisor.stop();
  });

  it('logs the connection and the hub state, and never the token', () => {
    const t = setup(local);
    t.set(satellite());
    vi.advanceTimersByTime(1_000);
    const onStateChange = t.build.mock.calls[0][1] as (state: string, lastError?: string) => void;
    onStateChange('held', 'hub refused the token');
    onStateChange('online');

    expect(t.logs).toContain('flow-tower: connected to http://hub.example:5317 as laptop');
    expect(t.logs).toContain('flow-tower: hub held: hub refused the token');
    expect(t.logs).toContain('flow-tower: hub online');
    for (const line of t.logs) expect(line).not.toContain(TOKEN);
    t.supervisor.stop();
  });

  it('stop() clears the timer, so no later tick reads the config', () => {
    const t = setup(satellite());
    t.supervisor.stop();
    const reads = t.build.mock.calls.length;
    t.set(local);
    vi.advanceTimersByTime(10_000);
    expect(t.build.mock.calls.length).toBe(reads);
    expect(t.built[0].relay.stop).toHaveBeenCalled();
  });

  it('a config paused flip calls pause, then resume, on the running relay', () => {
    const t = setup(satellite());
    // The relay built on the first tick is the one the flip must reach: give it the two methods a real relay has.
    const relay = t.built[0].relay as unknown as { pause: Spy; resume: Spy };
    relay.pause = vi.fn();
    relay.resume = vi.fn();

    t.set(satellite({ paused: true }));
    vi.advanceTimersByTime(1_000);
    expect(relay.pause).toHaveBeenCalledTimes(1);
    expect(relay.resume).not.toHaveBeenCalled();
    expect(t.logs).toContain('flow-tower: sharing paused');

    t.set(satellite({ paused: false }));
    vi.advanceTimersByTime(1_000);
    expect(relay.resume).toHaveBeenCalledTimes(1);
    expect(relay.pause.mock.invocationCallOrder[0]).toBeLessThan(relay.resume.mock.invocationCallOrder[0]);
    expect(t.logs).toContain('flow-tower: sharing resumed');
    expect(t.build).toHaveBeenCalledTimes(1);
    t.supervisor.stop();
  });
});
