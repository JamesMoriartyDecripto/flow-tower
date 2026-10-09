import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/adapters';
import { eventMatches, FlowEventSchema } from '../src/core/events';
import type { ResolvedNode } from '../src/core/types';

/** Real hook sequences (shapes from code.claude.com/docs/en/hooks and the session reported in #44). */
const cc = (h: object) => normalize('claude-code', { session_id: 's1', ...h }) as Record<string, unknown>[];
const kinds = (evs: Record<string, unknown>[]) => evs.map((e) => e.kind);

describe('Claude Code hooks (#44)', () => {
  it('injected turns are logs, real prompts stay prompts', () => {
    expect(kinds(cc({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the failing test' }))).toEqual(['prompt']);
    for (const injected of [
      '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>',
      '<agent-message from="a1">\n[Subagent hand-back] done\n</agent-message>',
      '<system-reminder>The user sent a new message</system-reminder>',
      '<cross-session-message from="other">hi</cross-session-message>',
    ]) {
      const [e] = cc({ hook_event_name: 'UserPromptSubmit', prompt: injected });
      expect(e.kind, injected).toBe('log');
      expect(String(e.message)).not.toMatch(/^</);
    }
  });

  it('a background subagent stays open until SubagentStop, and its tool calls carry its role', () => {
    const s = (h: object) => normalize('claude-code', { session_id: 'bg', ...h }) as Record<string, unknown>[];
    const start = s({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'toolu_1', tool_input: { subagent_type: 'general-purpose', description: 'Security finder', run_in_background: true } });
    expect(start).toEqual([expect.objectContaining({ kind: 'agent.start', agent: 'general-purpose', role: 'Security finder', call: 'toolu_1' })]);
    expect(kinds(s({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' }))).toEqual(['log']);
    const launched = s({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'toolu_1', tool_input: { subagent_type: 'general-purpose', description: 'Security finder' }, tool_response: { status: 'async_launched', agentId: 'a1' } });
    expect(kinds(launched)).toEqual(['log']); // launched, not finished
    const tool = s({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'toolu_2', agent_id: 'a1', agent_type: 'general-purpose', tool_input: { command: 'curl -s 127.0.0.1:5317/api/workspace' } });
    expect(tool).toEqual([expect.objectContaining({ kind: 'tool.start', agent: 'general-purpose', role: 'Security finder', agent_id: 'a1' })]);
    const stop = s({ hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'general-purpose', last_assistant_message: 'SECURITY FINDER report' });
    expect(stop).toEqual([expect.objectContaining({ kind: 'agent.end', role: 'Security finder', call: 'toolu_1', status: 'ok' })]);
  });

  it('a foreground subagent ends once and reports its usage', () => {
    const s = (h: object) => normalize('claude-code', { session_id: 'fg', ...h }) as Record<string, unknown>[];
    s({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'toolu_9', tool_input: { subagent_type: 'Explore', description: 'Find endpoints' } });
    s({ hook_event_name: 'SubagentStart', agent_id: 'e1', agent_type: 'Explore' });
    expect(kinds(s({ hook_event_name: 'SubagentStop', agent_id: 'e1', agent_type: 'Explore' }))).toEqual(['agent.end']);
    const done = s({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'toolu_9', tool_input: { subagent_type: 'Explore' }, tool_response: { status: 'completed', agentId: 'e1', totalTokens: 5400, totalDurationMs: 12000 } });
    expect(done).toEqual([expect.objectContaining({ kind: 'usage', agent: 'Explore', role: 'Find endpoints', tokens: 5400, duration_ms: 12000 })]);
  });

  it('SendMessage to a finished subagent starts it again', () => {
    const s = (h: object) => normalize('claude-code', { session_id: 'rs', ...h }) as Record<string, unknown>[];
    s({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'toolu_3', tool_input: { subagent_type: 'general-purpose', description: 'Docs finder' }, tool_response: { status: 'async_launched', agentId: 'd1' } });
    const resumed = s({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id: 'toolu_4', tool_input: { to: 'd1', message: 'also check the tables' } });
    expect(resumed).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'agent.start', agent: 'general-purpose', role: 'Docs finder', agent_id: 'd1' })]));
  });

  it('the main session is "main", and empty agent types count as missing', () => {
    expect(cc({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'a.ts' } })[0].agent).toBe('main');
    expect(cc({ hook_event_name: 'Stop', agent_type: '' })[0].agent).toBe('main');
    expect(cc({ hook_event_name: 'SubagentStop', agent_id: 'zz', agent_type: '' })[0].agent).not.toBe('');
  });
});

describe('match rules', () => {
  const node = (match: string[]) => ({ id: 'n', key: 'l.n', label: 'N', type: 'agent', tools: [], files: [], resources: [], ops: {}, meta: {}, status: 'active', layer: 'l', match }) as unknown as ResolvedNode;
  const ev = (x: object) => FlowEventSchema.parse(x);

  it('support negation with !', () => {
    // Patterns ignore case and punctuation, so negate on words.
    const n = node(['tool:Bash&!message:*npm*test*']);
    expect(eventMatches(n, ev({ kind: 'tool.start', tool: 'Bash', message: 'git status' }))).toBe(true);
    expect(eventMatches(n, ev({ kind: 'tool.start', tool: 'Bash', message: 'npm test' }))).toBe(false);
  });

  it('can match the role of a subagent', () => {
    expect(eventMatches(node(['role:*security*']), ev({ kind: 'tool.start', agent: 'general-purpose', role: 'Security finder', tool: 'Bash' }))).toBe(true);
  });
});
