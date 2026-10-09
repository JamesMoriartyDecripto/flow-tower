// Context compaction by relevance, not by summary (algorithm of fast-jev-compaction,
// simplified): Jev scores whether each old tool call and result is still needed;
// code keeps, truncates or drops; everything kept stays verbatim.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { ask, noul, type Question } from './jev.ts';
import { policy } from './config.ts';
import { logAction } from './judgments.ts';

const c = policy.compaction;
type Msg = Anthropic.MessageParam;
type Block = Anthropic.ContentBlockParam;
const blocks = (m: Msg): Block[] => (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as Block[]));
const size = (msgs: Msg[]) => JSON.stringify(msgs).length / 4; // rough tokens; fine for a trigger

export async function maybeCompact(messages: Msg[], goal: string): Promise<Msg[]> {
  if (size(messages) < c.trigger_tokens) return messages;
  const pinnedFrom = messages.length - c.preserve_recent_messages; // first message and the tail are never touched
  const old = messages.slice(1, pinnedFrom).flatMap(blocks);
  const answered = new Set(old.flatMap((b) => (b.type === 'tool_result' ? [b.tool_use_id] : [])));
  const ids = old.flatMap((b) => (b.type === 'tool_use' && answered.has(b.id) ? [b.id] : [])); // pairs fully outside the tail
  try {
    // State: the whole conversation, every tool result replaced by a size note.
    const state = { goal, conversation: messages.map((m) => ({ role: m.role, content: blocks(m).map(note) })) };
    const keep = new Map<string, { call: number; result: number }>();
    // Batches of 40 calls run concurrently; each resends the same state (stays under max_request_tokens).
    await Promise.all(chunk(ids, 40).map(async (batch) => {
      const qs: Record<string, Question> = {};
      for (const id of batch) {
        qs[`keep_call_${id}`] = { type: 'noul', instructions: `Knowing that call ${id} was made, with its input, still matters for the rest of the task.` };
        qs[`keep_result_${id}`] = { type: 'noul', instructions: `The verbatim result of call ${id} is still needed, and re-running the tool would not do.` };
      }
      const r = await ask('compaction', state, qs, { timeoutMs: 10_000, attempts: 2 });
      for (const id of batch) keep.set(id, { call: noul(r, `keep_call_${id}`), result: noul(r, `keep_result_${id}`) });
    }));
    const out = messages.map((m, i) => (i === 0 || i >= pinnedFrom ? m : { ...m, content: blocks(m).flatMap((b) => apply(b, keep)) }))
      .filter((m) => blocks(m).length > 0);
    const reduction = 1 - size(out) / size(messages);
    logAction('compaction', reduction >= c.min_reduction ? 'pruned' : 'fallback', { calls: ids.length, reduction: +reduction.toFixed(2) });
    return reduction >= c.min_reduction ? out : summarize(messages, goal);
  } catch (err) {
    logAction('compaction', 'fallback', { reason: String(err) });
    return summarize(messages, goal);
  }
}

function apply(b: Block, keep: Map<string, { call: number; result: number }>): Block[] {
  if (b.type === 'thinking' || b.type === 'redacted_thinking') return []; // see README: edited history and thinking blocks
  const id = b.type === 'tool_use' ? b.id : b.type === 'tool_result' ? b.tool_use_id : undefined;
  const k = id ? keep.get(id) : undefined;
  if (!k || k.result >= c.keep_threshold) return [b];
  if (k.call >= c.keep_threshold) {
    if (b.type !== 'tool_result') return [b];
    const text = JSON.stringify(b.content ?? '').slice(0, c.truncate_head_chars);
    return [{ ...b, content: `${text}\n[truncated by compaction; re-run the tool for the full output]` }];
  }
  return []; // call and result go together: no result is ever left without its call
}

// Fallback only: the LLM writes a summary when Jev cannot prune enough or is down.
async function summarize(messages: Msg[], goal: string): Promise<Msg[]> {
  const res = await new Anthropic().messages.create({
    model: 'claude-haiku-5-5', max_tokens: 4000, system: readFileSync('prompts/compaction-fallback.md', 'utf8'),
    messages: [{ role: 'user', content: JSON.stringify({ goal, transcript: messages.slice(0, -c.preserve_recent_messages) }) }],
  });
  const summary = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
  return [{ role: 'user', content: `${goal}\n\n<summary>\n${summary}\n</summary>` }, ...messages.slice(-c.preserve_recent_messages)];
}

const note = (b: Block) => (b.type === 'tool_result' ? { type: 'tool_result', id: b.tool_use_id, note: `ok, ${JSON.stringify(b.content ?? '').length} chars (omitted)` } : b);
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
