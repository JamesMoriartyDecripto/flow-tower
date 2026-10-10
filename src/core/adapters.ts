import { claudeCode } from './claudeCode.ts';
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
export const clip = (v: unknown, n = 240) => {
  const s = typeof v === 'string' ? v : v === undefined || v === null ? undefined : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
/** The most telling bit of a tool input: a command, a path, a query… */
const gist = (input: Raw) => clip(input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.url ?? input);

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

/** Codex tool names, aligned with its hook `tool_name` values (Bash, apply_patch, mcp__<server>__<tool>). */
const codexTool = (it: Raw) => {
  switch (it.type) {
    case 'command_execution': return 'Bash';
    case 'file_change': return 'apply_patch';
    case 'mcp_tool_call': return `mcp__${str(it.server)}__${str(it.tool)}`;
    case 'web_search': return 'web_search';
    default: return undefined;
  }
};

/** OpenAI Codex hooks (command stdin, Claude Code-like shape). */
const codexHook: Adapter = (r) => {
  const base = {
    source: 'codex', session: str(r.session_id), agent: str(r.agent_type) ?? str(r.agent_id) ?? 'codex',
    tool: str(r.tool_name), call: str(r.tool_use_id), model: str(r.model),
  };
  switch (r.hook_event_name) {
    case 'SessionStart': return [{ ...base, kind: 'session.start', message: str(r.source) }];
    case 'SessionEnd': return [{ ...base, kind: 'session.end', message: str(r.reason) }];
    case 'UserPromptSubmit': return [{ ...base, kind: 'prompt', message: clip(r.prompt) }];
    case 'PreToolUse': return [{ ...base, kind: 'tool.start', message: gist(obj(r.tool_input)) }];
    case 'PostToolUse': {
      // No status field: infer failure from the response (shell exit code, MCP isError).
      const res = obj(r.tool_response);
      const failed = (num(res.exit_code) ?? 0) !== 0 || res.is_error === true || res.isError === true;
      return [{ ...base, kind: 'tool.end', status: failed ? 'error' : 'ok', message: clip(r.tool_response, 160) }];
    }
    case 'SubagentStart': return [{ ...base, kind: 'agent.start' }];
    case 'SubagentStop': return [{ ...base, kind: 'agent.end', status: 'ok', message: clip(r.last_assistant_message, 160) }];
    case 'Stop': return [{ ...base, kind: 'agent.end', status: 'ok' }];
    case 'Interrupt': return [{ ...base, kind: 'agent.end', message: 'interrupted' }];
    case 'PermissionRequest': return [{ ...base, kind: 'log', message: `permission requested${base.tool ? `: ${base.tool}` : ''}` }];
    case 'PreCompact': return [{ ...base, kind: 'log', message: `context compaction (${str(r.trigger) ?? 'auto'})` }];
    default: return [{ ...base, kind: 'log', message: str(r.hook_event_name) ?? 'event' }];
  }
};

/** `codex exec --json` stdout lines. Only `thread.started` carries the thread id, so other lines have no session. */
const codexExec: Adapter = (r) => {
  const base = { source: 'codex', agent: 'codex' };
  const it = obj(r.item);
  const tool = codexTool(it);
  const failed = it.status === 'failed' || it.status === 'declined' || (num(it.exit_code) ?? 0) !== 0 || !!it.error;
  switch (r.type) {
    case 'thread.started': return [{ ...base, kind: 'session.start', session: str(r.thread_id) }];
    case 'turn.started': return [{ ...base, kind: 'agent.start' }];
    case 'turn.completed': {
      const u = obj(r.usage);
      const tokens = (num(u.input_tokens) ?? 0) + (num(u.output_tokens) ?? 0);
      return [{ ...base, kind: 'agent.end', status: 'ok' }, { ...base, kind: 'usage', tokens }];
    }
    case 'turn.failed': return [{ ...base, kind: 'agent.end', status: 'error', message: clip(obj(r.error).message) }];
    case 'error': return [{ ...base, kind: 'error', status: 'error', message: clip(r.message) }];
    case 'item.started':
      if (tool) return [{ ...base, kind: 'tool.start', tool, call: str(it.id), message: gist(it.type === 'mcp_tool_call' ? obj(it.arguments) : it) }];
      break;
    case 'item.completed':
      if (tool) {
        const out = it.type === 'file_change'
          ? (Array.isArray(it.changes) ? it.changes : []).map((c) => `${str(obj(c).kind)} ${str(obj(c).path)}`).join(', ')
          : obj(it.error).message ?? it.error ?? it.aggregated_output ?? it.result;
        return [{ ...base, kind: 'tool.end', tool, call: str(it.id), status: failed ? 'error' : 'ok', message: clip(out, 160) }];
      }
      if (it.type === 'agent_message') return [{ ...base, kind: 'log', message: clip(it.text) }];
      if (it.type === 'error') return [{ ...base, kind: 'error', status: 'error', message: clip(it.message) }];
      break;
  }
  // collab_tool_call: a completed spawn_agent / close_agent brackets a subagent's life (receiver ids = call).
  if (it.type === 'collab_tool_call') {
    const sub = {
      ...base, agent: str(it.agent_type) ?? 'subagent', parent: str(it.sender_thread_id),
      call: Array.isArray(it.receiver_thread_ids) ? it.receiver_thread_ids.join(',') : undefined,
    };
    if (r.type !== 'item.completed') return [];
    if (it.tool === 'spawn_agent') {
      return [failed ? { ...sub, kind: 'agent.end', status: 'error' } : { ...sub, kind: 'agent.start', message: clip(it.prompt) }];
    }
    if (it.tool === 'close_agent') return [{ ...sub, kind: 'agent.end', status: failed ? 'error' : 'ok' }];
  }
  return [];
};

/** OpenAI Codex: hooks, `codex exec --json` stream lines, or the legacy `notify` payload (kebab-case). */
const codex: Adapter = (r) => {
  if ('hook_event_name' in r) return codexHook(r);
  if (r.type === 'agent-turn-complete') {
    return [{ source: 'codex', kind: 'agent.end', agent: 'codex', session: str(r['thread-id']), status: 'ok', message: clip(r['last-assistant-message'], 160) }];
  }
  return codexExec(r);
};

const ADAPTERS: Record<string, Adapter> = { 'claude-code': claudeCode, 'agent-sdk': claudeCode, pi, hermes, codex };

export const SOURCES = Object.keys(ADAPTERS);

/**
 * Identity is orthogonal to the event kind: a payload may carry who/where/what on the envelope,
 * and every event mapped from it must keep it (#82). Undefined values are dropped so events
 * keep the exact shape each adapter produced.
 */
const IDENTITY_KEYS = ['user', 'host', 'runtime', 'project'] as const;
const identity = (r: Raw) => {
  const id: Raw = {};
  for (const k of IDENTITY_KEYS) {
    const v = str(r[k]);
    if (v !== undefined) id[k] = v;
  }
  return id;
};

/** Turns a raw payload from `source` into normalized events. Already-normalized events pass through. */
export function normalize(source: string | undefined, raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Raw;
  const src = source ?? str(r.source);
  if ('kind' in r) return [{ ...r, source: src ?? 'custom' }];
  const events = src && ADAPTERS[src] ? ADAPTERS[src](r) : 'hook_event_name' in r ? claudeCode(r) : [];
  const id = identity(r);
  // Envelope identity first, event fields last: an event's own value (if any) wins.
  return events.map((e) => ({ ...id, ...e }));
}
