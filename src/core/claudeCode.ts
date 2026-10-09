import type { FlowEventInput } from './events.ts';

/**
 * Claude Code hooks (command stdin or native `http` hooks) and Agent SDK hook callbacks.
 * Shapes: code.claude.com/docs/en/hooks. Lessons from a real session with background subagents (#44):
 * - UserPromptSubmit also fires for turns Claude Code injects (a background subagent reporting back,
 *   scheduled tasks, messages from other sessions): those are logs, not user prompts.
 * - An Agent call returns at once for background subagents (`tool_response.status: "async_launched"`):
 *   the subagent ends on SubagentStop, not on PostToolUse.
 * - Hooks fired inside a subagent carry `agent_id`. The Agent call that launched it carries the role
 *   (`description`), so this module remembers agent_id → role and stamps every later event with it.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Raw) : {});
const clip = (v: unknown, n = 240) => {
  const s = typeof v === 'string' ? v : v === undefined || v === null ? undefined : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
/** The most telling bit of a tool input: a command, a path, a query… */
const gist = (input: Raw) => clip(input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.url ?? input);

interface Sub { type?: string; role?: string; call?: string; stopped?: boolean }

/** agent_id → what launched it; Agent calls not yet tied to an agent_id, per session. Bounded. */
const subs = new Map<string, Sub>();
const pending = new Map<string, Sub[]>();
const MAX = 2000;
function remember(id: string, s: Sub) {
  const merged = { ...subs.get(id), ...s };
  subs.delete(id); // re-insert: the Map keeps insertion order, so the oldest entry is evicted first
  subs.set(id, merged);
  if (subs.size > MAX) subs.delete(subs.keys().next().value!);
}

/** Tags of turns Claude Code injects into the conversation (not typed by the user). */
const INJECTED = /^\s*<(task-notification|agent-message|system-reminder|cross-session-message|local-command-[a-z]+|command-[a-z]+)\b/;

function injectedSummary(prompt: string): string {
  const tag = INJECTED.exec(prompt)?.[1] ?? 'message';
  const field = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(prompt)?.[1]?.trim();
  if (tag === 'task-notification') {
    const id = field('task-id');
    const role = id ? subs.get(id)?.role : undefined;
    return `background task ${field('status') ?? 'update'}${role ? `: ${role}` : id ? ` (${id})` : ''}${field('summary') ? ` · ${field('summary')}` : ''}`;
  }
  if (tag === 'agent-message') {
    const from = /from="([^"]+)"/.exec(prompt)?.[1];
    const role = from ? subs.get(from)?.role : undefined;
    return `message from ${role ?? from ?? 'an agent'}`;
  }
  return `${tag.replace(/-/g, ' ')} (injected by Claude Code)`;
}

export function claudeCode(r: Raw): FlowEventInput[] {
  const session = str(r.session_id) ?? '';
  const agentId = str(r.agent_id);
  const known = agentId ? subs.get(agentId) : undefined;
  const base = {
    source: 'claude-code', session,
    // Inside a subagent: its type and role. Outside: the main session (or the --agent name).
    agent: str(r.agent_type) ?? known?.type ?? (agentId ? 'subagent' : 'main'),
    role: known?.role, agent_id: agentId,
    tool: str(r.tool_name), call: str(r.tool_use_id), duration_ms: num(r.duration_ms),
  };
  const input = obj(r.tool_input);
  const response = obj(r.tool_response);
  // The Agent (formerly Task) tool spawns a subagent: surface it as that subagent starting/ending.
  const isAgentTool = base.tool === 'Task' || base.tool === 'Agent';
  const sub = isAgentTool ? str(input.subagent_type) ?? 'general-purpose' : undefined;
  const role = str(input.description);

  switch (r.hook_event_name) {
    case 'SessionStart': return [{ ...base, kind: 'session.start', model: str(r.model), message: str(r.source) }];
    case 'SessionEnd': return [{ ...base, kind: 'session.end', message: str(r.reason) }];
    case 'UserPromptSubmit': {
      const prompt = str(r.prompt) ?? '';
      return INJECTED.test(prompt)
        ? [{ ...base, kind: 'log', message: injectedSummary(prompt) }]
        : [{ ...base, kind: 'prompt', message: clip(prompt) }];
    }
    case 'PreToolUse': {
      if (sub) {
        pending.set(session, [...(pending.get(session) ?? []), { type: sub, role, call: base.call }].slice(-50));
        return [{ ...base, kind: 'agent.start', agent: sub, role, tool: undefined, agent_id: undefined, message: clip(role ?? input.prompt) }];
      }
      const out: FlowEventInput[] = [{ ...base, kind: 'tool.start', message: gist(input) }];
      // SendMessage to a known subagent resumes it.
      const to = base.tool === 'SendMessage' ? str(input.to) : undefined;
      const target = to ? subs.get(to) : undefined;
      if (to && target) {
        remember(to, { stopped: false });
        out.push({ ...base, kind: 'agent.start', agent: target.type ?? 'subagent', role: target.role, agent_id: to, tool: undefined, call: target.call, message: `resumed: ${clip(input.message, 120) ?? ''}` });
      }
      return out;
    }
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const failed = r.hook_event_name === 'PostToolUseFailure';
      if (!sub) return [{ ...base, kind: 'tool.end', status: failed ? 'error' : 'ok', message: clip(failed ? r.error : r.tool_response, 160) }];
      const id = str(response.agentId);
      const queue = pending.get(session) ?? [];
      const launch = queue.find((p) => p.call === base.call) ?? { type: sub, role, call: base.call };
      pending.set(session, queue.filter((p) => p !== launch));
      if (id) remember(id, { type: launch.type, role: launch.role, call: launch.call });
      const own = { ...base, agent: launch.type ?? sub, role: launch.role, agent_id: id, tool: undefined };
      if (failed) return [{ ...own, kind: 'agent.end', status: 'error', message: clip(r.error, 160) }];
      // Background: it has only been launched. It ends on SubagentStop.
      if (response.status === 'async_launched') return [{ ...own, kind: 'log', message: `launched in the background${id ? ` (${id})` : ''}` }];
      const tokens = num(response.totalTokens);
      const usage = tokens === undefined ? [] : [{ ...own, kind: 'usage' as const, tokens, duration_ms: num(response.totalDurationMs) ?? base.duration_ms }];
      // Foreground: SubagentStop usually ended it already; then only the usage is new.
      return id && subs.get(id)?.stopped ? usage : [{ ...own, kind: 'agent.end', status: 'ok' }, ...usage];
    }
    case 'SubagentStart': {
      if (!agentId) return [{ ...base, kind: 'agent.start' }];
      // Tie the new agent_id to the Agent call that launched it (same session, same type, oldest first).
      const queue = pending.get(session) ?? [];
      const launch = known ? undefined : queue.find((p) => p.type === base.agent) ?? queue[0];
      if (launch) remember(agentId, launch);
      const s = subs.get(agentId);
      // The Agent call already reported the start: a second start would never be balanced.
      return s ? [{ ...base, role: s.role, call: s.call, kind: 'log', message: `subagent ${agentId} running` }] : [{ ...base, kind: 'agent.start' }];
    }
    case 'SubagentStop': {
      if (agentId) remember(agentId, { stopped: true });
      const s = agentId ? subs.get(agentId) : undefined;
      return [{ ...base, agent: str(r.agent_type) ?? s?.type ?? 'subagent', role: s?.role, call: s?.call, kind: 'agent.end', status: 'ok', message: clip(r.last_assistant_message, 160) }];
    }
    case 'Stop': return [{ ...base, kind: 'agent.end', status: 'ok', message: clip(r.last_assistant_message, 160) }];
    case 'StopFailure': return [{ ...base, kind: 'error', status: 'error', message: str(r.error) }];
    case 'Notification': return [{ ...base, kind: 'log', message: clip(r.message) }];
    case 'PreCompact': return [{ ...base, kind: 'log', message: `context compaction (${str(r.trigger) ?? 'auto'})` }];
    default: return [{ ...base, kind: 'log', message: str(r.hook_event_name) ?? 'event' }];
  }
}
