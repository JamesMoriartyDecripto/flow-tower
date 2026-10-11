#!/usr/bin/env node
// Answer one question about Flow Tower from this repo's docs: route -> JIT load -> write -> guard.
// Usage: node answer.mjs "<question>" [--model <id>] [--dry-run] [--whole-bytes <n>]
import { argv, exit } from 'node:process';
import { catalog, chat, DEFAULT_MODEL, DOCS, guard, keywordRoute, load, LOAD_WHOLE_BYTES, prompt, sections } from './lib.mjs';

/** First non-heading paragraph of a section: markdown headings, fences, table rows and rules skipped. */
function firstParagraph(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^(#{1,4}\s|```|\||---)/.test(line)) { if (lines.length) break; continue; }
    if (line) lines.push(line);
    else if (lines.length) break;
  }
  return lines.join(' ').trim();
}

/**
 * Mock writer for `--dry-run`: for each loaded doc, one sentence copied from its first non-heading
 * paragraph, closed by a citation that resolves. It does not answer the question; its only job is to
 * make the whole pipeline runnable offline, so the guard and the scorer are exercised too.
 */
function mockAnswer(loaded) {
  const lines = [];
  for (const part of loaded.parts) {
    // The file preamble carries no heading slug, so cite the first titled section that has prose.
    const sec = sections(part.text).find((s) => s.slug && firstParagraph(s.text));
    const para = sec && firstParagraph(sec.text);
    if (!para) continue;
    lines.push(`${/^.*?[.!?](?=\s|$)/.exec(para)?.[0] ?? para} (${part.doc}#${sec.slug})`);
  }
  return lines.join('\n') || 'Not in the docs.';
}

/** Router: a cheap model call over the catalog; the keyword router when offline or the reply is unusable. */
export async function route(question, { model, dryRun }) {
  const cat = catalog();
  const fallback = keywordRoute(question, cat);
  if (dryRun) return { ...fallback, tokens: 0, cost: 0 };
  const list = cat.map((c) => `- ${c.doc}: ${c.routes.join('; ')} ${c.head}`.slice(0, 600)).join('\n');
  try {
    const r = await chat(model, [{ role: 'system', content: prompt('router') }, { role: 'user', content: `Docs:\n${list}\n\nQuestion: ${question}` }]);
    const picked = (JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}').docs ?? []).filter((d) => DOCS.includes(d)).slice(0, 2);
    if (picked.length) return { docs: picked, by: 'model', tokens: r.tokens, cost: r.cost };
  } catch { /* fall through to the keyword router */ }
  return { ...fallback, tokens: 0, cost: 0 };
}

/** The whole answer flow. Returns the reply text and the stats line. */
export async function answer(question, { model = DEFAULT_MODEL, dryRun = false, wholeBytes = LOAD_WHOLE_BYTES } = {}) {
  const t0 = Date.now();
  const r = await route(question, { model, dryRun });
  const stats = { docs_loaded: r.docs, routed_by: r.by, tokens: r.tokens, cost: r.cost, ms: 0 };
  // The loader reads only the picked docs and needs no model, so the dry run reports it too: that is what
  // makes "loaded whole vs by section" checkable offline, and the dry run stays deterministic.
  const loaded = load(r.docs, question, { wholeBytes });
  stats.loaded_whole = loaded.whole;
  stats.loaded_sections = loaded.sections;
  stats.loaded_bytes = loaded.bytes;
  // The dry run skips the model call but not the rest of the pipeline: a mock writer stands in for the
  // model, then the guard runs on its output, so a broken guard call cannot hide offline again.
  if (dryRun) {
    const text = mockAnswer(loaded);
    const check = guard(text, loaded);
    stats.mock = true;
    stats.ms = Date.now() - t0;
    return { text, stats, route: r, guard: check };
  }

  const context = loaded.parts.map((l) => `<doc path="${l.doc}">\n${l.text}</doc>`).join('\n');
  const messages = [{ role: 'system', content: prompt('answer') }, { role: 'user', content: `${context}\n\nQuestion: ${question}` }];
  let text = '';
  let check;
  // At most one loop back from the guard to the writer, then "not in the docs".
  for (let round = 0; round < 2; round++) {
    const w = await chat(model, messages);
    stats.tokens += w.tokens;
    stats.cost += w.cost;
    text = w.text.trim();
    check = guard(text, loaded);
    if (check.ok) break;
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: `${prompt('guard')}\nProblems: ${check.problems.join('; ')}` });
  }
  if (!check.ok) text = `Not in the docs. Closest doc: ${r.docs[0]}\n(guard: ${check.problems.join('; ')})`;
  stats.ms = Date.now() - t0;
  return { text, stats, route: r, guard: check };
}

const isMain = import.meta.url === `file://${argv[1]}`;
if (isMain) {
  const args = argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const model = flag('--model') ?? DEFAULT_MODEL;
  const wholeBytes = Number(flag('--whole-bytes')) || LOAD_WHOLE_BYTES;
  const dryRun = args.includes('--dry-run');
  const question = args.filter((a) => a !== '--dry-run').join(' ').trim();
  if (!question) { console.error('usage: node answer.mjs "<question>" [--model <id>] [--dry-run] [--whole-bytes <n>]'); exit(1); }
  try {
    const out = await answer(question, { model, dryRun, wholeBytes });
    console.log(out.text);
    console.log(JSON.stringify(out.stats));
  } catch (e) {
    console.error(e.message);
    exit(1);
  }
}
