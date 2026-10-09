// Tool-risk gate, pi-warden style: offline patterns first, one Jev request for the
// rest, and a fixed table that turns probabilities into allow / warn / review / block.
// The LLM that proposed the call never grades its own call.
import { ask, noul } from './jev.ts';
import { policy, questionsFor } from './config.ts';
import { logAction } from './judgments.ts';

export type Verdict = { action: 'allow' | 'warn' | 'review' | 'block'; reason: string; scores?: Record<string, number> };
export interface ToolCall { name: string; input: Record<string, unknown> }

const p = policy.tool_risk;
const readOnlyBash = (p.ask_gate.read_only_bash as string[]).map((r) => new RegExp(r));
const floor = (p.offline_floor as string[]).map((r) => new RegExp(r));

export async function gate(call: ToolCall, ctx: { request: string; plan: string; gitStatus: string }): Promise<Verdict> {
  const command = call.name === 'Bash' ? String(call.input.command ?? '') : '';

  // 1. Ask gate: no Jev answer could change the outcome of a read-only call.
  if (p.ask_gate.read_only_tools.includes(call.name) || readOnlyBash.some((r) => r.test(command))) {
    return record(call, { action: 'allow', reason: 'read_only' });
  }
  // 2. Offline floor: destructive patterns hold without a request (works with no key).
  const hit = floor.find((r) => r.test(command));
  if (hit) return record(call, { action: 'review', reason: `pattern ${hit.source}` });

  // 3. One Jev request, three nouls, judged against the same state.
  let scores: Record<string, number>;
  try {
    const r = await ask('tool_risk', { request: ctx.request, plan: ctx.plan, tool_call: call, git_status: ctx.gitStatus }, questionsFor('tool_risk'), {
      timeoutMs: p.timeout_ms,
      attempts: 2,
    });
    scores = { irreversible: noul(r, 'irreversible'), leaks_secret: noul(r, 'leaks_secret'), off_task: noul(r, 'off_task') };
  } catch {
    return record(call, { action: p.on_jev_error, reason: 'jev_error' }); // mutating + unjudged = a human looks
  }

  // 4. Code decides. off_task is logged, never acted on (it failed its precision gate upstream).
  if (scores.leaks_secret >= p.leaks_secret.block) return record(call, { action: 'block', reason: 'leaks_secret', scores });
  if (scores.irreversible >= p.irreversible.hold) return record(call, { action: 'review', reason: 'irreversible', scores });
  if (scores.irreversible >= p.irreversible.warn) return record(call, { action: 'warn', reason: 'irreversible', scores });
  return record(call, { action: 'allow', reason: 'below_thresholds', scores });
}

// Text the LLM sees after a warn or block. Fixed sentences: the model gets the
// decision, not a debate.
export function steer(v: Verdict): string {
  if (v.action === 'block') return `Blocked by policy (${v.reason}). Do not retry this call; find another way or ask the user.`;
  if (v.action === 'warn') return 'This call may be hard to undo. Prefer a reversible alternative (a branch, a copy, --dry-run) if one exists.';
  return '';
}

function record(call: ToolCall, v: Verdict): Verdict {
  logAction('tool_risk', v.action, { tool: call.name, reason: v.reason, scores: v.scores });
  return v;
}
