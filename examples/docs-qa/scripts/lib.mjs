// Shared by answer.mjs and eval.mjs: the doc catalog, the keyword router, section loading,
// the OpenRouter call and the citation guard. Node 22, no dependencies.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const EXAMPLE = resolve(HERE, '..');
// Dogfood: the docs live two levels up. Copied elsewhere, point DOCS_QA_ROOT at a flow-tower clone.
export const ROOT = resolve(env.DOCS_QA_ROOT || join(EXAMPLE, '../..'));
export const DEFAULT_MODEL = 'google/gemini-3.5-flash-lite';
// The judge must not be the model it grades: a different family (DeepSeek vs Google) avoids a model
// preferring its own answers. Overridable with --judge-model.
export const DEFAULT_JUDGE_MODEL = 'deepseek/deepseek-v4.1-flash';

// Docs the router may pick. The CLAUDE.md table routes most of them; the rest are where the table points.
export const DOCS = [
  'docs/getting-started.md', 'docs/what-goes-where.md', 'docs/schema.md', 'docs/generate-a-tower.md',
  'docs/realtime.md', 'docs/command-center.md', 'docs/hub-reference.md', 'docs/voice.md',
  'docs/architecture.md', 'examples/command-center/README.md', 'examples/team-hub/README.md',
  'examples/dev-squad/README.md', 'skills/flow-tower-costs/SKILL.md', 'NEXT.md', 'README.md',
];

export const prompt = (name) => readFileSync(join(EXAMPLE, 'prompts', `${name}.md`), 'utf8');
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '');

export const slug = (h) => h.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

/** Split a Markdown file into { heading, slug, text } sections (code fences kept intact). */
export function sections(text) {
  const out = [{ heading: '', slug: '', text: '' }];
  let fence = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fence = !fence;
    const m = !fence && /^#{1,4}\s+(.*)$/.exec(line);
    if (m) out.push({ heading: m[1], slug: slug(m[1]), text: '' });
    out.at(-1).text += line + '\n';
  }
  return out.filter((s) => s.text.trim());
}

/** The routing view of each doc: its CLAUDE.md table rows, its first lines and its headings. */
export function catalog() {
  const table = read('CLAUDE.md').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Task'));
  return DOCS.filter((d) => read(d)).map((doc) => {
    const text = read(doc);
    const rows = table.filter((r) => r.includes(doc.replace(/^docs\//, '')) || r.includes(doc)).map((r) => r.split('|')[1].trim());
    const head = text.replace(/^---[\s\S]*?---\n/, '').split('\n').slice(0, 7).join(' ');
    const heads = sections(text).map((s) => s.heading).filter(Boolean);
    return { doc, routes: rows, head, headings: heads };
  });
}

const STOP = new Set('a an and are as at be by can do does for from how i if in is it its my of on or the to what when where which who why with you your me one this that there have get use using'.split(' '));
export const words = (s) => s.toLowerCase().match(/[a-z0-9][a-z0-9.-]*/g)?.map((w) => w.replace(/[.-]+$/, '')).filter((w) => w.length > 1 && !STOP.has(w)) ?? [];

/** Deterministic router: idf-weighted word overlap; table rows and first lines count double. */
export function keywordRoute(question, cat = catalog()) {
  const bag = (c) => ({ strong: new Set(words(c.routes.join(' ') + ' ' + c.head)), weak: new Set(words(c.headings.join(' '))) });
  const bags = cat.map(bag);
  const df = (w) => bags.filter((b) => b.strong.has(w) || b.weak.has(w)).length || 1;
  const q = [...new Set(words(question))];
  const scored = cat.map((c, i) => ({ doc: c.doc, score: q.reduce((s, w) => s + (bags[i].strong.has(w) ? 2 : bags[i].weak.has(w) ? 1 : 0) * Math.log(1 + cat.length / df(w)), 0) }))
    .sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  const docs = [first.doc];
  if (second && second.score >= first.score * 0.6) docs.push(second.doc);
  return { docs, by: 'keywords', scores: scored.slice(0, 4).map((s) => `${s.doc}=${s.score.toFixed(1)}`) };
}

// Docs are written to be read whole (5-15 KB); only bigger ones fall back to section selection.
export const LOAD_WHOLE_BYTES = 16_000;

/**
 * JIT load. A picked doc at most `wholeBytes` long is loaded whole: section selection used to drop the
 * section that held the answer whenever it shared no words with the question. Above that size, keep the
 * doc header, the sections that share words with the question and their neighbours, capped per doc.
 * Returns the parts plus which docs were loaded whole vs by section, and the loaded bytes.
 */
export function load(docs, question, { wholeBytes = LOAD_WHOLE_BYTES, maxChars = 14000 } = {}) {
  const q = new Set(words(question));
  const parts = docs.map((doc) => {
    const full = read(doc);
    if (Buffer.byteLength(full) <= wholeBytes) return { doc, text: full, mode: 'whole', bytes: Buffer.byteLength(full) };
    const secs = sections(full);
    const keep = new Set([0]);
    secs.forEach((s, i) => {
      if (i && words(s.heading + ' ' + s.text).some((w) => q.has(w))) [i - 1, i, i + 1].forEach((n) => keep.add(n));
    });
    let text = '';
    for (const [i, s] of secs.entries()) if (keep.has(i) && text.length + s.text.length <= maxChars) text += s.text;
    return { doc, text, mode: 'sections', bytes: Buffer.byteLength(text) };
  });
  const pick = (mode) => parts.filter((p) => p.mode === mode).map((p) => p.doc);
  return { parts, whole: pick('whole'), sections: pick('sections'), bytes: parts.reduce((n, p) => n + p.bytes, 0) };
}

/** One chat completion with a timeout and one retry. The key comes from the shell and is never printed. */
export async function chat(model, messages, { timeoutMs = 45000 } = {}) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set in this shell (or use --dry-run)');
  const body = JSON.stringify({ model, messages, reasoning: { effort: 'low' }, provider: { data_collection: 'deny' }, usage: { include: true } });
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', body, signal: AbortSignal.timeout(timeoutMs),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'flow-tower docs-qa' },
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      return { text: j.choices?.[0]?.message?.content ?? '', tokens: j.usage?.total_tokens ?? 0, cost: j.usage?.cost ?? 0 };
    } catch (e) { last = e; }
  }
  throw last;
}

/** Citation guard: each `file#heading` must name a loaded file, an existing heading, and share words with its claim. */
export function guard(answer, loaded) {
  const problems = [];
  const cites = [...answer.matchAll(/`?([\w./-]+\.md)#([\w-]+)`?/g)];
  if (!cites.length && !/not in the docs/i.test(answer)) problems.push('no citation');
  for (const m of cites) {
    const [, file, anchor] = m;
    const src = loaded.parts.find((l) => l.doc === file);
    const sec = src && sections(read(file)).find((s) => s.slug === anchor);
    if (!src) problems.push(`${file}: not a loaded doc`);
    else if (!sec) problems.push(`${file}#${anchor}: no such heading`);
    else {
      // The claim is the sentence the citation closes: at least two of its words must be in that section.
      const claim = answer.slice(Math.max(0, answer.lastIndexOf('\n', m.index)), m.index);
      const body = new Set(words(sec.text));
      if (words(claim).filter((w) => body.has(w)).length < Math.min(2, words(claim).length)) problems.push(`${file}#${anchor}: does not support "${claim.trim().slice(0, 60)}"`);
    }
  }
  return { ok: !problems.length, problems, cites: cites.map((m) => `${m[1]}#${m[2]}`) };
}
