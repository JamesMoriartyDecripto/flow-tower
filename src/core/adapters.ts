import type { FlowEventInput } from './events.ts';

/**
 * Source adapters: map each runtime's native payload onto FlowEvent.
 * Field names follow the official docs (see docs/realtime.md for links and versions).
 */

type Raw = Record<string, unknown>;
type Adapter = (raw: Raw) => FlowEventInput[];

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Raw) : {});
const clip = (v: unknown, n = 240) => {
  const s = typeof v === 'string' ? v : v === undefined || v === null ? undefined : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
/** The most telling bit of a tool input: a command, a path, a query… */
const gist = (input: Raw) => clip(input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.url ?? input);

/** Claude Code hooks (command stdin or native `http` hooks) and Agent SDK hook callbacks. */
const claudeCode: Adapter = (r) => {
  const base = {
    source: 'claude-code', session: str(r.session_id), agent: str(r.agent_type) ?? str(r.agent_id),
    tool: str(r.tool_name), call: str(r.tool_use_id), duration_ms: num(r.duration_ms),
  };
  const input = obj(r.tool_input);
  // The Agent (formerly Task) tool spawns a subagent: surface it as that subagent starting/ending.
  const sub = base.tool === 'Task' || base.tool === 'Agent' ? str(input.subagent_type) : undefined;
  switch (r.hook_event_name) {
    case 'SessionStart': return [{ ...base, kind: 'session.start', model: str(r.model), message: str(r.source) }];
    case 'SessionEnd': return [{ ...base, kind: 'session.end', message: str(r.reason) }];
    case 'UserPromptSubmit': return [{ ...base, kind: 'prompt', message: clip(r.prompt) }];
    case 'PreToolUse':
      return [sub
        ? { ...base, kind: 'agent.start', agent: sub, tool: undefined, message: clip(input.description ?? input.prompt) }
        : { ...base, kind: 'tool.start', message: gist(input) }];
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const failed = r.hook_event_name === 'PostToolUseFailure';
      return [sub
        ? { ...base, kind: 'agent.end', agent: sub, tool: undefined, status: failed ? 'error' : 'ok' }
        : { ...base, kind: 'tool.end', status: failed ? 'error' : 'ok', message: clip(failed ? r.error : r.tool_response, 160) }];
    }
    case 'SubagentStart': return [{ ...base, kind: 'agent.start' }];
    case 'SubagentStop': return [{ ...base, kind: 'agent.end', status: 'ok', message: clip(r.last_assistant_message, 160) }];
    case 'Stop': return [{ ...base, kind: 'agent.end', agent: base.agent ?? 'main', status: 'ok' }];
    case 'StopFailure': return [{ ...base, kind: 'error', status: 'error', message: str(r.error) }];
    case 'Notification': return [{ ...base, kind: 'log', message: clip(r.message) }];
    case 'PreCompact': return [{ ...base, kind: 'log', message: `context compaction (${str(r.trigger) ?? 'auto'})` }];
    default: return [{ ...base, kind: 'log', message: str(r.hook_event_name) ?? 'event' }];
  }
};

/** Pi coding agent: extension events (`pi.on(...)`) or `pi --mode json` stream lines, tagged with `type`. */
const pi: Adapter = (r) => {
  const base = {
    source: 'pi', session: str(r.session) ?? str(r.sessionId), agent: str(r.agent) ?? 'pi',
    tool: str(r.toolName), call: str(r.toolCallId),
  };
  switch (r.type) {
    case 'session_start': return [{ ...base, kind: 'session.start', message: str(r.reason) }];
    case 'session_shutdown': return [{ ...base, kind: 'session.end' }];
    case 'input': return [{ ...base, kind: 'prompt', message: clip(r.text ?? r.input) }];
    case 'agent_start': return [{ ...base, kind: 'agent.start' }];
    case 'agent_end': return [{ ...base, kind: 'agent.end', status: 'ok' }];
    case 'tool_execution_start': return [{ ...base, kind: 'tool.start', message: gist(obj(r.args ?? r.input)) }];
    case 'tool_execution_end':
      return [{ ...base, kind: 'tool.end', status: r.isError ? 'error' : 'ok', message: clip(r.result, 160) }];
    case 'turn_end': {
      const usage = obj(obj(r.message).usage);
      const cost = obj(usage.cost);
      return [{ ...base, kind: 'usage', tokens: num(usage.totalTokens) ?? num(usage.input), cost_usd: num(cost.total) }];
    }
    case 'model_select': return [{ ...base, kind: 'log', model: str(obj(r.model).id) ?? str(r.model), message: 'model selected' }];
    default: return [{ ...base, kind: 'log', message: str(r.type) ?? 'event' }];
  }
};

/** Hermes Agent: outbound webhooks / shell hooks (Claude Code-like shape, event-specific fields maybe under `extra`). */
const hermes: Adapter = (r) => {
  const x = { ...obj(r.extra), ...r };
  const base = {
    source: 'hermes', session: str(x.session_id), agent: str(x.child_role) ?? str(x.profile),
    parent: str(x.parent_session_id), tool: str(x.tool_name), call: str(x.tool_call_id), duration_ms: num(x.duration_ms),
  };
  switch (x.hook_event_name ?? x.event) {
    case 'on_session_start': return [{ ...base, kind: 'session.start' }];
    case 'on_session_finalize': return [{ ...base, kind: 'session.end' }];
    case 'pre_tool_call': return [{ ...base, kind: 'tool.start', message: gist(obj(x.args ?? x.tool_input)) }];
    case 'post_tool_call':
      return [{ ...base, kind: 'tool.end', status: x.status === 'error' ? 'error' : 'ok', message: clip(x.result, 160) }];
    case 'subagent_start': return [{ ...base, kind: 'agent.start', message: clip(x.child_goal) }];
    case 'subagent_stop':
      return [{ ...base, kind: 'agent.end', status: x.child_status === 'error' ? 'error' : 'ok', message: clip(x.child_summary, 160) }];
    case 'post_api_request': {
      const usage = obj(x.usage);
      return [{ ...base, kind: 'usage', model: str(x.model), tokens: num(usage.total_tokens) }];
    }
    case 'api_request_error': return [{ ...base, kind: 'error', status: 'error', message: clip(x.error) }];
    default: return [{ ...base, kind: 'log', message: str(x.hook_event_name ?? x.event) ?? 'event' }];
  }
};

const ADAPTERS: Record<string, Adapter> = { 'claude-code': claudeCode, 'agent-sdk': claudeCode, pi, hermes };

export const SOURCES = Object.keys(ADAPTERS);

/** Turns a raw payload from `source` into normalized events. Already-normalized events pass through. */
export function normalize(source: string | undefined, raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Raw;
  const src = source ?? str(r.source);
  if ('kind' in r) return [{ ...r, source: src ?? 'custom' }];
  if (src && ADAPTERS[src]) return ADAPTERS[src](r);
  if ('hook_event_name' in r) return claudeCode(r);
  return [];
}
