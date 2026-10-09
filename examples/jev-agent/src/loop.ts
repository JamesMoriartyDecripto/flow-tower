// The act loop. The LLM writes (code, commands, explanations); Jev decides (is this
// call safe, what comes next); code acts (runs, holds, steers, stops).
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { gate, steer } from './risk-gate.ts';
import { ask, choice } from './jev.ts';
import { policy, questionsFor, WORKER_MODEL } from './config.ts';
import { logAction } from './judgments.ts';
import { TOOLS, runTool, requestReview, gitStatus } from './tools.ts';
import { maybeCompact } from './compact.ts';
import { browse } from './browser.ts';

const client = new Anthropic();
const SYSTEM = readFileSync('prompts/agent.md', 'utf8');

const NEXT_STEER: Record<string, string> = {
  continue: '',
  run_check: 'Run the affected tests, build or lint now, before any further edit.',
  new_hypothesis: 'This approach failed repeatedly. State a different hypothesis for the cause and test it first.',
  finish: 'The plan looks complete. Reply with what changed and which check passed; make no more tool calls.',
};

export async function actLoop(request: string, worker: keyof typeof WORKER_MODEL, messages: Anthropic.MessageParam[]) {
  const streak = { cmd: '', n: 0 };
  for (let i = 0; i < policy.next_action.max_iterations; i++) {
    messages = await maybeCompact(messages, request);
    const res = await client.messages.create({ model: WORKER_MODEL[worker], max_tokens: 16000, system: SYSTEM, tools: TOOLS, messages });
    messages.push({ role: 'assistant', content: res.content }); // full content: keeps thinking blocks valid
    if (res.stop_reason === 'refusal') return { status: 'refused' as const, messages };

    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (calls.length === 0) return { status: 'stop_requested' as const, messages }; // the Stop hook judges it
    const plan = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');

    const results: Anthropic.ContentBlockParam[] = [];
    for (const call of calls) {
      const input = call.input as Record<string, unknown>;
      const v = await gate({ name: call.name, input }, { request, plan, gitStatus: gitStatus() });
      if (v.action === 'block' || (v.action === 'review' && !(await requestReview(call, v)))) {
        results.push({ type: 'tool_result', tool_use_id: call.id, content: steer(v) || 'Rejected by the reviewer.', is_error: true });
        continue;
      }
      const out = call.name === 'browse' ? await browse(String(input.goal), String(input.url)) : await runTool(call.name, input);
      if (call.name === 'Bash') trackStreak(streak, String(input.command), out.ok);
      results.push({ type: 'tool_result', tool_use_id: call.id, content: [out.text, steer(v)].filter(Boolean).join('\n\n'), is_error: !out.ok });
    }

    const next = await decideNext(request, plan, results, streak.n);
    if (next === 'escalate') return { status: 'escalate' as const, messages: [...messages, { role: 'user' as const, content: results }] };
    // Steers ride as a text block after the tool results, never as an edit to history.
    if (NEXT_STEER[next]) results.push({ type: 'text', text: NEXT_STEER[next] });
    messages.push({ role: 'user', content: results });
  }
  return { status: 'escalate' as const, messages }; // iteration cap reached
}

async function decideNext(request: string, plan: string, results: unknown[], failingStreak: number): Promise<string> {
  // Code overrides Jev where the rule is mechanical: 3 identical failures -> new hypothesis.
  if (failingStreak >= policy.next_action.force_new_hypothesis_after) return record('new_hypothesis', 'streak');
  try {
    const a = choice(await ask('next_action', { request, plan, last_3_tool_results: results.slice(-3), failing_command_streak: failingStreak }, questionsFor('next_action')), 'next');
    if (a.probabilities.escalate >= policy.next_action.escalate_min_p) return record('escalate', 'p_escalate');
    if (a.choice === 'finish' && a.confidence < policy.next_action.finish_min_confidence) return record('run_check', 'unsure_finish');
    return record(a.choice, 'jev');
  } catch {
    return record('continue', 'jev_error'); // the Stop hook still guards the exit
  }
}

function trackStreak(s: { cmd: string; n: number }, cmd: string, ok: boolean) {
  if (ok) Object.assign(s, { cmd: '', n: 0 });
  else Object.assign(s, { cmd, n: s.cmd === cmd ? s.n + 1 : 1 });
}

const record = (action: string, reason: string) => (logAction('next_action', action, { reason }), action);
