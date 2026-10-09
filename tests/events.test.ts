import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/adapters';
import { eventMatches, FlowEventSchema, resolveTargets } from '../src/core/events';
import { buildTower } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Workspace } from '../src/core/types';

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
