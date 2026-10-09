/**
 * Simulates a live agentic run against a running flow-tower, for demos and load tests.
 *   node --experimental-strip-types scripts/simulate.ts [project-substring] [--walkers 3] [--speed 1] [--url http://127.0.0.1:5317]
 * Agent nodes send Claude Code hook payloads (exercising the adapter); other nodes send explicit events.
 */
import { parseArgs } from 'node:util';
import { sampleApiRequest } from '../src/core/otlp.ts';
import type { ResolvedNode, ResolvedTower, Workspace } from '../src/core/types.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    walkers: { type: 'string', default: '3' },
    speed: { type: 'string', default: '1' },
    url: { type: 'string', default: 'http://127.0.0.1:5317' },
  },
});
const speed = Number(values.speed);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / speed));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const FALLBACK_TOOLS = ['Read', 'Grep', 'Edit', 'Bash', 'WebSearch'];

async function post(body: unknown, source?: string) {
  await fetch(`${values.url}/api/events${source ? `?source=${source}` : ''}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => console.error('flow-tower not reachable at', values.url));
}

async function runAgent(node: ResolvedNode, session: string) {
  const agent = node.agent?.id ?? node.id;
  const hook = (h: object) => post({ session_id: session, agent_type: agent, ...h }, 'claude-code');
  await hook({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: agent, description: node.label } });
  const tools = node.tools.length ? node.tools : FALLBACK_TOOLS;
  for (let k = 0; k < 1 + Math.floor(Math.random() * 3); k++) {
    const tool = pick(tools);
    const id = `toolu_${Math.random().toString(36).slice(2, 10)}`;
    await hook({ hook_event_name: 'PreToolUse', tool_name: tool, tool_use_id: id, tool_input: { command: `${tool.toLowerCase()} …` } });
    await sleep(300 + Math.random() * 1200);
    const failed = Math.random() < 0.08;
    await hook(failed
      ? { hook_event_name: 'PostToolUseFailure', tool_name: tool, tool_use_id: id, error: 'exit code 1' }
      : { hook_event_name: 'PostToolUse', tool_name: tool, tool_use_id: id, tool_response: 'ok', duration_ms: 420 });
  }
  await hook({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: agent } });
  // Tokens and cost arrive through OpenTelemetry, as with Claude Code telemetry enabled.
  await fetch(`${values.url}/v1/logs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleApiRequest(agent, node.model, session)),
  }).catch(() => undefined);
}

async function runStep(node: ResolvedNode, tower: ResolvedTower) {
  const base = { source: 'simulator', node: node.key, tower: tower.id };
  await post({ ...base, kind: 'tool.start', message: node.label });
  await sleep(400 + Math.random() * 900);
  await post({ ...base, kind: 'tool.end', status: Math.random() < 0.05 ? 'error' : 'ok' });
}

async function walker(tower: ResolvedTower, nodes: Map<string, ResolvedNode>, out: Map<string, string[]>, n: number) {
  const entries = [...nodes.values()].filter((x) => x.type === 'entry');
  for (;;) {
    const session = `sim-${n}-${Date.now()}`;
    let cur: ResolvedNode | undefined = pick(entries.length ? entries : [...nodes.values()]);
    for (let steps = 0; cur && steps < 40; steps++) {
      if (cur.type === 'agent') await runAgent(cur, session);
      else await runStep(cur, tower);
      const next: string[] = out.get(cur.key) ?? [];
      cur = next.length ? nodes.get(pick(next)) : undefined;
      await sleep(150);
    }
    await sleep(800);
  }
}

const ws = (await (await fetch(`${values.url}/api/workspace`)).json()) as Workspace;
const id = ws.projects.find((p) => p.includes(positionals[0] ?? '')) ?? ws.projects[0];
const tower = ws.towers[id];
const nodes = new Map(tower.layers.flatMap((l) => l.nodes.map((n) => [n.key, n] as const)));
const out = new Map<string, string[]>();
for (const e of [...tower.layers.flatMap((l) => l.edges), ...tower.links]) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);

console.log(`simulating ${tower.name} (${nodes.size} nodes) with ${values.walkers} walkers — Ctrl+C to stop`);
await Promise.all(Array.from({ length: Number(values.walkers) }, (_, i) => sleep(i * 700).then(() => walker(tower, nodes, out, i))));
