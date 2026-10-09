import { useEffect } from 'react';
import { create } from 'zustand';
import { normalize } from '../core/adapters';
import { FlowEventSchema, resolveTargets, type FlowEvent } from '../core/events';
import { otlpLogsToEvents, sampleApiRequest } from '../core/otlp';
import type { ResolvedNode, ResolvedTower } from '../core/types';
import { useLive } from './live';
import { STATIC } from './staticData';
import { useStore, useTower } from './store';

/**
 * In-browser live simulator for the static demo: the same walk as scripts/simulate.ts, without a
 * server. Agent nodes go through the Claude Code adapter (as real hooks would); other nodes send
 * plain tool events. Walkers follow the edges of the tower on screen and stop in hidden tabs.
 */
export const useDemo = create<{ on: boolean; toggle(): void }>()((set, get) => ({
  on: true,
  toggle: () => set({ on: !get().on }),
}));

const WALKERS = 2;
const TOOLS = ['Read', 'Grep', 'Edit', 'Bash', 'WebSearch'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
let seq = 0;

function emit(raw: unknown, source?: string) {
  const ws = useStore.getState().workspace;
  if (!ws) return;
  const events: FlowEvent[] = normalize(source, raw).flatMap((x) => {
    const parsed = FlowEventSchema.safeParse(x);
    if (!parsed.success) return [];
    const e = parsed.data;
    return [{ ...e, id: ++seq, ts: Date.now(), targets: resolveTargets(ws, e) }];
  });
  if (events.length) useLive.getState().apply(events);
}

async function walk(tower: ResolvedTower, alive: () => boolean, n: number) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const nodes = new Map(tower.layers.flatMap((l) => l.nodes.map((x) => [x.key, x] as const)));
  const out = new Map<string, string[]>();
  for (const e of [...tower.layers.flatMap((l) => l.edges), ...tower.links]) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const entries = [...nodes.values()].filter((x) => x.type === 'entry');
  await sleep(n * 900);
  while (alive()) {
    const session = `demo-${n}-${Date.now()}`;
    let cur: ResolvedNode | undefined = pick(entries.length ? entries : [...nodes.values()]);
    for (let steps = 0; cur && steps < 30 && alive(); steps++) {
      if (cur.type === 'agent') {
        const agent = cur.agent?.id ?? cur.id;
        const hook = (h: object) => emit({ session_id: session, agent_type: agent, ...h }, 'claude-code');
        hook({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: agent, description: cur.label } });
        const tool = pick(cur.tools.length ? cur.tools : TOOLS);
        const id = `toolu_${Math.random().toString(36).slice(2, 10)}`;
        hook({ hook_event_name: 'PreToolUse', tool_name: tool, tool_use_id: id, tool_input: { command: `${tool.toLowerCase()} …` } });
        await sleep(600 + Math.random() * 1400);
        hook(Math.random() < 0.06
          ? { hook_event_name: 'PostToolUseFailure', tool_name: tool, tool_use_id: id, error: 'exit code 1 (simulated)' }
          : { hook_event_name: 'PostToolUse', tool_name: tool, tool_use_id: id, tool_response: 'ok' });
        hook({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: agent } });
        // Tokens and cost, through the same OTLP parser the server uses for Claude Code telemetry.
        for (const e of otlpLogsToEvents(sampleApiRequest(agent, cur.model, session))) emit(e);
      } else {
        const base = { source: 'demo', node: cur.key, tower: tower.id };
        emit({ ...base, kind: 'tool.start', message: cur.label });
        await sleep(500 + Math.random() * 1000);
        emit({ ...base, kind: 'tool.end', status: Math.random() < 0.04 ? 'error' : 'ok' });
      }
      const next: string[] = out.get(cur.key) ?? [];
      cur = next.length ? nodes.get(pick(next)) : undefined;
      await sleep(300);
    }
    await sleep(1500);
  }
}

/** Runs the walkers on the tower on screen while the demo is on and the tab is visible. */
export function useDemoSimulator() {
  const tower = useTower();
  const on = useDemo((s) => s.on);
  useEffect(() => {
    if (!STATIC || !on || !tower) return;
    let stopped = false;
    const alive = () => !stopped && document.visibilityState === 'visible';
    let run = 0;
    const startAll = () => {
      const mine = ++run;
      for (let i = 0; i < WALKERS; i++) void walk(tower, () => alive() && run === mine, i);
    };
    startAll();
    // Walkers end in a hidden tab; start fresh ones when it comes back.
    const onVisible = () => { if (document.visibilityState === 'visible' && !stopped) startAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [tower, on]);
}
