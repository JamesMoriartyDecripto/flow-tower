import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/adapters';
import { FlowEventSchema, resolveTargets } from '../src/core/events';
import { buildTower } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Workspace } from '../src/core/types';

/**
 * The maintainer's rule: the harness must not matter. The same session (prompt, a `ls` that works,
 * a `false` that fails, a reviewer subagent, usage, end) is sent through every harness's real payload
 * shape, normalized by the ingest path, and checked against one table. A gap is fixed or declared in
 * LIMITS with its reason; a declared gap that starts passing fails too, so LIMITS cannot go stale.
 */

type Ev = ReturnType<typeof FlowEventSchema.parse>;
type Harness = 'claude-code' | 'codex' | 'pi' | 'hermes' | 'agent-sdk' | 'emit';
const HARNESSES: Harness[] = ['claude-code', 'codex', 'pi', 'hermes', 'agent-sdk', 'emit'];

const load = (h: Harness): unknown[] =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/parity/${h}.json`, import.meta.url)), 'utf8'));
/** Same path as ingest: normalize(source, raw) per payload, then the schema every event must pass. */
const run = (h: Harness): Ev[] => load(h).flatMap((raw) => normalize(h, raw)).map((e) => FlowEventSchema.parse(e));

/** Each check returns the reason it fails, or undefined when the harness passes. */
const CHECKS: Record<string, (events: Ev[]) => string | undefined> = {
  'one session id': (events) => {
    const ids = new Set(events.map((e) => e.session).filter(Boolean));
    return ids.size === 1 ? undefined : `${ids.size} session ids`;
  },
  'session bounds': (events) => {
    const starts = events.filter((e) => e.kind === 'session.start').length;
    const ends = events.filter((e) => e.kind === 'session.end').length;
    return starts === 1 && ends === 1 ? undefined : `${starts} session.start, ${ends} session.end`;
  },
  prompt: (events) => (events.some((e) => e.kind === 'prompt') ? undefined : 'no prompt event'),
  'tool pairs': (events) => {
    const starts = events.filter((e) => e.kind === 'tool.start');
    const ends = events.filter((e) => e.kind === 'tool.end');
    if (starts.length !== 2 || ends.length !== 2) return `${starts.length} tool starts, ${ends.length} ends`;
    // The ls call must succeed, the false call must end in error; each start pairs with its end by call id.
    for (const [call, status] of [['tu-1', 'ok'], ['tu-2', 'error']] as const) {
      const end = ends.find((e) => e.call === call);
      if (!starts.some((e) => e.call === call) || !end) return `call ${call} is not paired`;
      if (end.status !== status) return `call ${call} ended ${end.status ?? 'without status'}, want ${status}`;
    }
    return undefined;
  },
  // Pi lowercases (`bash`), the others say `Bash`. The matcher ignores case, so both reach one rule.
  'tool names': (events) => {
    const names = events.filter((e) => e.kind === 'tool.start' || e.kind === 'tool.end').map((e) => (e.tool ?? '').toLowerCase());
    return names.every((n) => n === 'bash') && names.length === 4 ? undefined : `tool names: ${[...new Set(names)].join(', ') || 'none'}`;
  },
  subagent: (events) => {
    const start = events.some((e) => e.kind === 'agent.start' && e.agent === 'reviewer');
    const stop = events.some((e) => e.kind === 'agent.end' && e.agent === 'reviewer');
    return start && stop ? undefined : 'no reviewer agent.start and agent.end';
  },
  'usage tokens': (events) =>
    events.some((e) => e.kind === 'usage' && typeof e.tokens === 'number' && e.tokens > 0) ? undefined : 'no usage with tokens',
  'usage cost': (events) =>
    events.some((e) => e.kind === 'usage' && typeof e.cost_usd === 'number') ? undefined : 'no usage with cost_usd',
};

type Check = keyof typeof CHECKS;

/**
 * Declared gaps: harness → check → reason it cannot pass. The check must still fail (see the test below).
 */
const LIMITS: Partial<Record<Harness, Partial<Record<Check, string>>>> = {
  'claude-code': {
    'usage tokens': 'hook payloads carry no token counts; tokens come from OpenTelemetry (docs/realtime.md)',
    'usage cost': 'hook payloads carry no cost; cost comes from OpenTelemetry',
  },
  codex: {
    'usage tokens': 'hooks carry no token counts (docs/realtime.md); tokens come only from `codex exec --json` or OTEL',
    'usage cost': 'hooks carry no cost; cost comes from OTEL',
  },
  pi: {
    subagent: 'Pi has no subagent events; its agent_start is the main agent, not a subagent',
  },
  hermes: {
    prompt: 'Hermes outbound hooks do not include a prompt event (integrations/hermes/config.yaml)',
    'usage cost': 'post_api_request reports total_tokens only',
  },
  'agent-sdk': {
    'usage tokens': 'the SDK hook list has no usage event; tokens are not in the hook payload',
    'usage cost': 'the SDK hook list has no usage event; cost is not in the hook payload',
  },
};

describe('harness parity: one session, every adapter', () => {
  it.each(HARNESSES)('%s passes the table, or declares each gap', (h) => {
    const events = run(h);
    for (const [name, check] of Object.entries(CHECKS)) {
      const problem = check(events);
      const declared = LIMITS[h]?.[name as Check];
      if (declared) expect(problem, `${h} "${name}" is declared (${declared}) but passes: drop it from LIMITS`).toBeDefined();
      else expect(problem, `${h} "${name}"`).toBeUndefined();
    }
  });
});

describe('harness parity: the main session is agent main everywhere', () => {
  // One tower rule (`agent:main`) must light the main agent whatever the harness, so every main-session event says `main`.
  it.each(HARNESSES)('%s: main-session events carry agent main', (h) => {
    // Subagent events (the reviewer) keep their own name; only the main session's prompt and tool events are checked.
    const mains = run(h).filter((e) => e.kind === 'prompt' || e.kind === 'tool.start' || e.kind === 'tool.end');
    expect(mains.length).toBeGreaterThan(0);
    for (const e of mains) expect(e.agent, `${h} ${e.kind}`).toBe('main');
  });
});

describe('harness parity: the shell call matches one node', async () => {
  // The recommended rule: one tool node per tool name, matched case- and punctuation-insensitively.
  const def = TowerSchema.parse({
    name: 'Parity',
    agents: { main: { name: 'Main' } },
    layers: [
      { id: 'a', title: 'A', nodes: [{ id: 'main', agent: 'main' }] },
      { id: 't', title: 'T', nodes: [{ id: 'shell', type: 'tool', match: ['tool:bash'] }] },
    ],
  });
  const file = 'parity.tower.yaml';
  const tower = await buildTower(def, file, { read: async () => undefined }, []);
  const ws: Workspace = { projects: [file], towers: { [file]: tower }, loadedAt: '' };
  const shell = `${file}#t.shell`;

  it.each(HARNESSES)('%s: ls and false land on the shell node', (h) => {
    const calls = run(h).filter((e) => (e.kind === 'tool.start' || e.kind === 'tool.end') && (e.call === 'tu-1' || e.call === 'tu-2'));
    expect(calls).toHaveLength(4);
    for (const e of calls) expect(resolveTargets(ws, e), `${h} ${e.kind} ${e.call}`).toContain(shell);
  });
});
