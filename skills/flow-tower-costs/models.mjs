#!/usr/bin/env node
// List OpenRouter models with prices, to shortlist candidates per role.
// Uses the public models endpoint: no API key needed, so nothing secret is ever read.
// Usage: node models.mjs [regex] [--tools] [--since YYYY-MM-DD]
import { argv, exit } from 'node:process';

const args = argv.slice(2);
const tools = args.includes('--tools');
const sinceAt = args.indexOf('--since');
const since = sinceAt >= 0 ? Date.parse(args[sinceAt + 1]) / 1000 : 0;
// A bad date would silently filter out every model: say so instead.
if (Number.isNaN(since)) { console.error('--since needs a date, YYYY-MM-DD'); exit(1); }
const filterArg = args.find((a, i) => !a.startsWith('--') && (sinceAt < 0 || i !== sinceAt + 1));
let filter = null;
try { filter = filterArg ? new RegExp(filterArg, 'i') : null; } catch { console.error(`not a valid regex: ${filterArg}`); exit(1); }

// One public, rate-limited request: run it once and reuse the output, do not poll it.
let data;
try {
  const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ({ data } = await res.json());
} catch (err) {
  console.error(`OpenRouter models list unavailable: ${err.message}`);
  exit(1);
}

// Prices come as USD per token strings; per million tokens is what pricing pages show.
const perM = (p) => (p == null || p === '' ? null : Number(p) * 1e6);
const fmt = (n) => (n == null ? '-' : n < 0 ? 'var' : `$${n.toFixed(2)}`);

const rows = data
  .filter((m) => !filter || filter.test(m.id))
  // Tool support matters more than price for agent roles: a model without it cannot run the loop.
  .filter((m) => !tools || (m.supported_parameters ?? []).includes('tools'))
  .filter((m) => (m.created ?? 0) >= since)
  .map((m) => ({
    id: m.id,
    date: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : '-',
    in: perM(m.pricing?.prompt),
    out: perM(m.pricing?.completion),
    cached: perM(m.pricing?.input_cache_read),
    ctx: m.context_length ?? '-',
    tools: (m.supported_parameters ?? []).includes('tools') ? 'yes' : 'no',
  }))
  .sort((a, b) => (a.out ?? Infinity) - (b.out ?? Infinity));

console.log(['id', 'released', 'in/M', 'out/M', 'cached-in/M', 'context', 'tools'].join('\t'));
for (const r of rows) console.log([r.id, r.date, fmt(r.in), fmt(r.out), fmt(r.cached), r.ctx, r.tools].join('\t'));
console.error(`${rows.length} models`);
