import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/adapters';
import { eventMatches, FlowEventSchema, resolveRuntime, resolveTargets } from '../src/core/events';
import { buildTower } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Workspace } from '../src/core/types';
import { createEventHub } from '../src/server/events';

const ev = (x: object) => FlowEventSchema.parse(x);

describe('adapters', () => {
  it('maps Claude Code hooks, including subagent spawns via the Agent tool', () => {
    expect(normalize(undefined, { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'npm test' } }))
      .toEqual([expect.objectContaining({ kind: 'tool.start', tool: 'Bash', call: 't1', message: 'npm test', source: 'claude-code' })]);
    expect(normalize('claude-code', { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'reviewer', description: 'review diff' } }))
      .toEqual([expect.objectContaining({ kind: 'agent.start', agent: 'reviewer', tool: undefined })]);
    expect(normalize('claude-code', { hook_event_name: 'PostToolUseFailure', tool_name: 'Edit', error: 'boom' }))
      .toEqual([expect.objectContaining({ kind: 'tool.end', status: 'error', message: 'boom' })]);
  });

  it('maps Pi and Hermes events', () => {
    expect(normalize('pi', { type: 'tool_execution_end', toolName: 'bash', toolCallId: 'c', isError: true }))
      .toEqual([expect.objectContaining({ kind: 'tool.end', status: 'error', tool: 'bash', agent: 'pi' })]);
    expect(normalize('hermes', { hook_event_name: 'subagent_start', extra: { child_role: 'researcher', child_goal: 'find docs' } }))
      .toEqual([expect.objectContaining({ kind: 'agent.start', agent: 'researcher', message: 'find docs' })]);
  });

  it('maps Codex hooks', () => {
    const common = { session_id: '0199a213-81c0-7800-8aa1-bbab2a035a53', transcript_path: '/home/u/.codex/sessions/rollout.jsonl', cwd: '/repo', model: 'gpt-5-codex', turn_id: '1' };
    expect(normalize('codex', { ...common, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'call_1', tool_input: { command: 'npm test' } }))
      .toEqual([{ kind: 'tool.start', source: 'codex', session: common.session_id, agent: 'codex', tool: 'Bash', call: 'call_1', model: 'gpt-5-codex', message: 'npm test' }]);
    expect(normalize('codex', {
      ...common, hook_event_name: 'PostToolUse', tool_name: 'mcp__github__create_pull_request', tool_use_id: 'call_2',
      tool_input: { title: 'Fix login' }, tool_response: { content: [{ type: 'text', text: 'not found' }], isError: true },
    })).toEqual([expect.objectContaining({ kind: 'tool.end', tool: 'mcp__github__create_pull_request', call: 'call_2', status: 'error' })]);
    expect(normalize('codex', { ...common, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'explorer' }))
      .toEqual([expect.objectContaining({ kind: 'agent.start', agent: 'explorer', source: 'codex' })]);
  });

  it('maps codex exec --json lines', () => {
    expect(normalize('codex', { type: 'thread.started', thread_id: '0199a213-81c0-7800-8aa1-bbab2a035a53' }))
      .toEqual([expect.objectContaining({ kind: 'session.start', session: '0199a213-81c0-7800-8aa1-bbab2a035a53' })]);
    expect(normalize('codex', { type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'bash -lc "npm test"', aggregated_output: '', exit_code: null, status: 'in_progress' } }))
      .toEqual([expect.objectContaining({ kind: 'tool.start', tool: 'Bash', call: 'item_1', message: 'bash -lc "npm test"' })]);
    expect(normalize('codex', { type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'bash -lc "npm test"', aggregated_output: '1 failing', exit_code: 1, status: 'failed' } }))
      .toEqual([expect.objectContaining({ kind: 'tool.end', tool: 'Bash', call: 'item_1', status: 'error', message: '1 failing' })]);
    expect(normalize('codex', { type: 'item.completed', item: { id: 'item_2', type: 'mcp_tool_call', server: 'github', tool: 'search_issues', arguments: { query: 'login' }, result: { content: [] }, error: null, status: 'completed' } }))
      .toEqual([expect.objectContaining({ kind: 'tool.end', tool: 'mcp__github__search_issues', status: 'ok' })]);
    expect(normalize('codex', { type: 'item.completed', item: { id: 'item_3', type: 'file_change', changes: [{ path: 'src/a.ts', kind: 'update' }], status: 'completed' } }))
      .toEqual([expect.objectContaining({ kind: 'tool.end', tool: 'apply_patch', message: 'update src/a.ts' })]);
    expect(normalize('codex', { type: 'turn.completed', usage: { input_tokens: 24763, cached_input_tokens: 24448, output_tokens: 122, reasoning_output_tokens: 64 } }))
      .toEqual([expect.objectContaining({ kind: 'agent.end', status: 'ok' }), expect.objectContaining({ kind: 'usage', tokens: 24885 })]);
    expect(normalize('codex', { type: 'item.completed', item: { id: 'item_4', type: 'reasoning', text: '**Planning**' } })).toEqual([]);
  });

  it('maps the legacy Codex notify payload', () => {
    expect(normalize('codex', {
      type: 'agent-turn-complete', 'thread-id': 'b5f6c1c2', 'turn-id': '12345', cwd: '/repo', client: 'codex-tui',
      'input-messages': ['Rename `foo` to `bar`'], 'last-assistant-message': 'Rename complete.',
    })).toEqual([{ kind: 'agent.end', source: 'codex', agent: 'codex', session: 'b5f6c1c2', status: 'ok', message: 'Rename complete.' }]);
  });

  it('accepts the identity/tokens fields and stays permissive', () => {
    const e = FlowEventSchema.parse({
      kind: 'usage', user: 'u', host: 'h', runtime: 'claude-code/aws', project: 'p',
      estimated: true, tokens_detail: { input: 1, cache_read: 2 }, whatever: 'kept',
    });
    expect(e).toEqual(expect.objectContaining({ user: 'u', host: 'h', runtime: 'claude-code/aws', project: 'p', estimated: true }));
    expect(FlowEventSchema.parse({ kind: 'log', unknown: 1 })).toEqual(expect.objectContaining({ unknown: 1 }));
  });

  it('passes normalized events through and drops junk', () => {
    expect(normalize(undefined, { kind: 'log', message: 'hi' })).toEqual([{ kind: 'log', message: 'hi', source: 'custom' }]);
    expect(normalize(undefined, 'nope')).toEqual([]);
    expect(normalize(undefined, { random: 1 })).toEqual([]);
  });
});

describe('matching', async () => {
  const def = TowerSchema.parse({
    name: 'T',
    agents: { coder: { name: 'Coder' } },
    layers: [
      { id: 'a', title: 'A', nodes: [{ id: 'coder', agent: 'coder' }, { id: 'ci', match: ['source:github*&tool:deploy'] }] },
      { id: 't', title: 'T', nodes: [{ id: 'bash', type: 'tool', label: 'Bash' }, { id: 'github', type: 'tool' }] },
    ],
  });
  const tower = await buildTower(def, 'x.tower.yaml', { read: async () => undefined }, []);
  const ws: Workspace = { projects: ['x.tower.yaml'], towers: { 'x.tower.yaml': tower }, loadedAt: '' };

  it('lights the agent and the tool it used', () => {
    expect(resolveTargets(ws, ev({ kind: 'tool.start', agent: 'coder', tool: 'Bash' }))).toEqual(['x.tower.yaml#a.coder', 'x.tower.yaml#t.bash']);
  });
  it('maps MCP tools onto their server node', () => {
    expect(resolveTargets(ws, ev({ kind: 'tool.start', tool: 'mcp__github__create_pull_request' }))).toEqual(['x.tower.yaml#t.github']);
  });
  it('honours explicit match rules and node targets', () => {
    const ci = tower.layers[0].nodes[1];
    expect(eventMatches(ci, ev({ kind: 'log', source: 'github-actions', tool: 'deploy' }))).toBe(true);
    expect(eventMatches(ci, ev({ kind: 'log', source: 'github-actions', tool: 'test' }))).toBe(false);
    expect(resolveTargets(ws, ev({ kind: 'log', node: 't.bash' }))).toEqual(['x.tower.yaml#t.bash']);
    expect(resolveTargets(ws, ev({ kind: 'log', agent: 'coder', tower: 'nope' }))).toEqual([]);
  });
});

describe('resolveRuntime', () => {
  // Runtimes are plain objects on the resolved tower: no need for the loader here.
  const tower = { runtimes: {
    laptop: { id: 'laptop', kind: 'local', label: 'Dev laptop' },
    vps: { id: 'vps', kind: 'server', host: 'vps-01' },
    gha: { id: 'gha', kind: 'ci', label: 'GitHub Actions' },
  } } as unknown as Parameters<typeof resolveRuntime>[0];

  it('matches the runtime whose host is the event host', () => {
    expect(resolveRuntime(tower, ev({ kind: 'log', host: 'vps-01' }))).toBe('vps');
    expect(resolveRuntime(tower, ev({ kind: 'log', host: 'other' }))).toBeUndefined();
  });
  it('matches the runtime id or label, ignoring case and the part after "/"', () => {
    expect(resolveRuntime(tower, ev({ kind: 'log', runtime: 'LAPTOP' }))).toBe('laptop');
    expect(resolveRuntime(tower, ev({ kind: 'log', runtime: 'github actions' }))).toBe('gha');
    expect(resolveRuntime(tower, ev({ kind: 'log', runtime: 'claude-code/vps' }))).toBe('vps');
  });
  it('returns undefined for no match and for a tower without runtimes', () => {
    expect(resolveRuntime(tower, ev({ kind: 'log', runtime: 'nope' }))).toBeUndefined();
    expect(resolveRuntime(tower, ev({ kind: 'log', host: 'x', runtime: 'y' }))).toBeUndefined();
    expect(resolveRuntime({ runtimes: {} } as unknown as Parameters<typeof resolveRuntime>[0], ev({ kind: 'log', host: 'vps-01' }))).toBeUndefined();
  });
});

describe('?tower= on /api/events', () => {
  it('restricts matching to one of two versions of the same project', async () => {
    const def = TowerSchema.parse({ name: 'Squad', layers: [{ id: 'a', title: 'A', nodes: [{ id: 'coder', label: 'Coder', match: ['agent:coder'] }] }] });
    const tower = async (id: string, name: string) => ({ ...(await buildTower(def, id, { read: async () => undefined }, [])), name });
    const ws: Workspace = { projects: ['v1.tower.yaml', 'v2.tower.yaml'], towers: { 'v1.tower.yaml': await tower('v1.tower.yaml', 'Squad'), 'v2.tower.yaml': await tower('v2.tower.yaml', 'Squad v2') }, loadedAt: '' };
    const hub = createEventHub(() => ws, () => undefined);
    hub.ingest({ kind: 'agent.start', agent: 'coder' });
    hub.ingest({ kind: 'agent.start', agent: 'coder' }, undefined, 'v2');
    const [both, only] = hub.recent();
    expect(both.targets).toEqual(['v1.tower.yaml#a.coder', 'v2.tower.yaml#a.coder']);
    expect(only.targets).toEqual(['v2.tower.yaml#a.coder']);
  });

  it('records the runtime the event matched on the ingested event', () => {
    const def = TowerSchema.parse({ name: 'T', runtimes: { vps: { kind: 'server', host: 'vps-01' } }, layers: [{ id: 'a', title: 'A', nodes: [{ id: 'coder', match: ['agent:coder'] }] }] });
    return buildTower(def, 'x.tower.yaml', { read: async () => undefined }, []).then((t) => {
      const hub = createEventHub(() => ({ projects: ['x.tower.yaml'], towers: { 'x.tower.yaml': t }, loadedAt: '' }), () => undefined);
      hub.ingest({ kind: 'agent.start', agent: 'coder', host: 'vps-01' });
      expect(hub.recent()[0].runtimeRef).toBe('vps');
    });
  });
});
