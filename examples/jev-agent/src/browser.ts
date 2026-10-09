// Browser worker, after browser-use/jev-ultrafast: every observation becomes an indexed
// element table; ONE Jev request picks the operation and, speculatively, a target for
// each operation that needs one; a small LLM writes text only for TYPE_TEXT.
// `Page` is an adapter over Chrome DevTools Protocol, not implemented in this example.
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { ask, choice, type Question } from './jev.ts';
import { policy, BROWSER_TEXT_MODEL } from './config.ts';
import { logAction } from './judgments.ts';

export interface Element { index: number; role: string; name: string; value: string; editable: boolean; options?: string[] }
export interface Page {
  snapshot(): Promise<{ elements: Element[]; visibleText: string; version: number }>; // one atomic CDP call
  act(op: string, index?: number, text?: string): Promise<void>; // re-checks freshness and occlusion first
  verify(goal: string): Promise<boolean>; // independent check of the outcome, not a model call
}
declare function openPage(url: string): Promise<Page>; // adapter (CDP / Browser Harness)

const OPS = ['CLICK', 'TYPE_TEXT', 'SELECT', 'SCROLL_UP', 'SCROLL_DOWN', 'WAIT', 'DONE', 'BLOCKED'];
const table = (els: Element[]) => Object.fromEntries(els.map((e) => [String(e.index), `${e.role} ${e.name} · ${e.value || 'empty'}`]));

export async function browse(goal: string, url: string): Promise<{ ok: boolean; text: string }> {
  const page = await openPage(url);
  const trace: string[] = [];
  let unsure = 0;
  for (let step = 0; step < policy.browser.max_steps; step++) {
    const snap = await page.snapshot();
    const clickable = snap.elements.filter((e) => !e.editable);
    const editable = snap.elements.filter((e) => e.editable);
    // Only supported operations and compatible targets are offered: Jev cannot pick outside them.
    const qs: Record<string, Question> = {
      operation: { type: 'choice', instructions: 'Which operation moves the page closer to the goal?', criteria: Object.fromEntries(OPS.map((o) => [o, null])) },
    };
    if (clickable.length) qs.click_target = { type: 'choice', instructions: 'Which element should be clicked?', criteria: table(clickable) };
    if (editable.length) qs.type_text_target = { type: 'choice', instructions: 'Which field should receive text?', criteria: table(editable) };

    const r = await ask('browser_step', { goal, elements: table(snap.elements), visible_text: snap.visibleText.slice(0, 4000), last_actions: trace.slice(-3) }, qs);
    const op = choice(r, 'operation');
    if (op.confidence < policy.browser.operation_min_confidence && unsure++ === 0) continue; // re-observe once
    logAction('browser_step', op.choice, { confidence: op.confidence, step });

    if (op.choice === 'DONE') {
      const ok = await page.verify(goal);
      return { ok, text: `${ok ? 'DONE' : 'CLAIMED DONE, check failed'} after ${step} steps\n${trace.join('\n')}` };
    }
    if (op.choice === 'BLOCKED' || op.confidence < policy.browser.operation_min_confidence) return { ok: false, text: `BLOCKED\n${trace.join('\n')}` };
    const target = op.choice === 'TYPE_TEXT' ? choice(r, 'type_text_target').choice : op.choice === 'CLICK' ? choice(r, 'click_target').choice : undefined;
    const text = op.choice === 'TYPE_TEXT' ? await writeText(goal, snap.elements.find((e) => String(e.index) === target)!) : undefined;
    await page.act(op.choice, target ? Number(target) : undefined, text);
    trace.push(`${op.choice}${target ? ` [${target}]` : ''}${text ? ` "${text}"` : ''}`);
  }
  return { ok: false, text: `BLOCKED: step cap\n${trace.join('\n')}` };
}

// The only text generation in the browser loop. Output must parse as a small JSON object;
// it never becomes a selector, a coordinate or JavaScript.
async function writeText(goal: string, field: Element): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: BROWSER_TEXT_MODEL,
      messages: [
        { role: 'system', content: readFileSync('prompts/browser-text.md', 'utf8') },
        { role: 'user', content: JSON.stringify({ goal, field: { role: field.role, name: field.name, value: field.value } }) },
      ],
    }),
  });
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const { text } = JSON.parse(body.choices[0].message.content) as { text: string };
  if (typeof text !== 'string' || text.length > 200) throw new Error('text helper returned an invalid value');
  return text;
}
