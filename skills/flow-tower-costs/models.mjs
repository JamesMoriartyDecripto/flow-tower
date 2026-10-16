#!/usr/bin/env node
// List OpenRouter models with prices, to shortlist candidates per role.
// Uses the public models endpoint: no API key needed, so nothing secret is ever read.
// Usage: node models.mjs [regex] [--tools] [--since YYYY-MM-DD] [--modality M] [--role ID] [--families N] [--sort S] [--variants]
//   regex            case-insensitive filter on the model id, e.g. "claude|gemini"
//   --tools          only models that support tool calls
//   --since DATE     only models released on or after DATE (YYYY-MM-DD)
//   --modality M     list by output modality (text, image, video, audio, speech, transcription,
//                    embeddings, rerank, decisions, all); default text
//   --role ID        shortlist for a role of src/core/roles.ts: its modality, filtered by what it needs
//   --families N     at most N models per provider family, so the shortlist spans providers
//   --sort S         order: top-weekly, most-popular, newest, pricing-low-to-high, pricing-high-to-low,
//                    throughput-high-to-low, latency-low-to-high (sorted by OpenRouter), or price
//                    (cheapest output first, sorted here). Default top-weekly for --role/--families, else price.
//   --variants       keep ":batch" and "~" alias ids, which are not separate models (dropped by default)
//   -h, --help       print this usage and exit
// Models with a variable or zero price are listed after the priced ones (with --sort price).
// Non-text modalities price per image, per second or per call: the price column shows those keys.
// The shortlist is ranked by real use, not by the lowest price: the cheapest models are often small ones.
import { argv, exit } from 'node:process';
import { ROLE_FILTERS, capPerFamily, dropVariants, familyOf, meets } from './roles.mjs';

const MODALITIES = ['text', 'image', 'video', 'audio', 'speech', 'transcription', 'embeddings', 'rerank', 'decisions', 'all'];
// Server-side orders OpenRouter understands; 'price' is the local cheapest-output-first order.
const SERVER_SORTS = ['top-weekly', 'most-popular', 'newest', 'pricing-low-to-high', 'pricing-high-to-low', 'throughput-high-to-low', 'latency-low-to-high'];
const SORTS = [...SERVER_SORTS, 'price'];

const args = argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node models.mjs [regex] [--tools] [--since YYYY-MM-DD] [--modality M] [--role ID] [--families N] [--sort S] [--variants]');
  console.log('  regex           case-insensitive filter on the model id');
  console.log('  --tools         only models that support tool calls');
  console.log('  --since DATE    only models released on or after DATE (YYYY-MM-DD)');
  console.log(`  --modality M    output modality to list: ${MODALITIES.join(', ')} (default text)`);
  console.log(`  --role ID       shortlist for a role: ${Object.keys(ROLE_FILTERS).join(', ')}`);
  console.log('  --families N    at most N models per provider family, in the sort order (keeps the shortlist spread out)');
  console.log(`  --sort S        ${SORTS.join(', ')} (default top-weekly with --role or --families, else price)`);
  console.log('  --variants      keep ":batch" and "~" alias ids (dropped by default: not separate models)');
  console.log('  -h, --help      print this usage and exit');
  exit(0);
}

// Options that take a value: their values are not the regex filter.
const VALUED = ['--since', '--modality', '--role', '--families', '--sort'];
const valueOf = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const tools = args.includes('--tools');
const sinceArg = valueOf('--since');
const since = sinceArg !== undefined ? Date.parse(sinceArg) / 1000 : 0;
// A bad date would silently filter out every model: say so instead.
if (sinceArg !== undefined && Number.isNaN(since)) { console.error('--since needs a date, YYYY-MM-DD'); exit(1); }

const roleId = valueOf('--role');
const role = roleId !== undefined ? ROLE_FILTERS[roleId] : undefined;
if (roleId !== undefined && !role) { console.error(`unknown role: ${roleId}\nroles: ${Object.keys(ROLE_FILTERS).join(', ')}`); exit(1); }

const modality = role?.modality ?? valueOf('--modality');
if (modality !== undefined && !MODALITIES.includes(modality)) {
  console.error(`unknown modality: ${modality}\nmodalities: ${MODALITIES.join(', ')}`);
  exit(1);
}

const familiesArg = valueOf('--families');
const families = familiesArg !== undefined ? Number(familiesArg) : undefined;
if (families !== undefined && (!Number.isInteger(families) || families < 1)) { console.error('--families needs a whole number, 1 or more'); exit(1); }

// A shortlist (--role or --families) ranks by real use by default; the plain listing keeps the price order.
const sortArg = valueOf('--sort');
const sort = sortArg ?? (role !== undefined || families !== undefined ? 'top-weekly' : 'price');
if (!SORTS.includes(sort)) { console.error(`unknown sort: ${sort}\nsorts: ${SORTS.join(', ')}`); exit(1); }

const showVariants = args.includes('--variants');

const filterArg = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
let filter = null;
try { filter = filterArg ? new RegExp(filterArg, 'i') : null; } catch { console.error(`not a valid regex: ${filterArg}`); exit(1); }

// One public, rate-limited request: run it once and reuse the output, do not poll it.
// No modality parameter keeps the endpoint's default (text), so the old output is unchanged.
const url = new URL('https://openrouter.ai/api/v1/models');
if (modality !== undefined) url.searchParams.set('output_modalities', modality);
// Server-side sort: OpenRouter orders the list, so the local re-sort below is skipped for it.
if (SERVER_SORTS.includes(sort)) url.searchParams.set('sort', sort);
let data;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ({ data } = await res.json());
} catch (err) {
  console.error(`OpenRouter models list unavailable: ${err.message}`);
  exit(1);
}

// Prices come as USD per token strings; per million tokens is what pricing pages show.
const perM = (p) => (p == null || p === '' ? null : Number(p) * 1e6);
const fmt = (n) => (n == null ? '-' : n < 0 ? 'var' : `$${n.toFixed(2)}`);
// Non-token prices (image_output, request, per-second keys): show up to two non-zero, as raw strings.
const otherPrices = (pricing) =>
  Object.entries(pricing ?? {})
    .filter(([, v]) => v != null && v !== '' && Number(v) !== 0)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ') || '-';

function priceRank(p) {
  if (p == null) return 2;
  if (p < 0 || p === 0) return 1;
  return 0;
}

const listed = (showVariants ? data : dropVariants(data))
  .filter((m) => !filter || filter.test(m.id))
  // Tool support matters more than price for agent roles: a model without it cannot run the loop.
  .filter((m) => !tools || (m.supported_parameters ?? []).includes('tools'))
  .filter((m) => !role || meets(m, role.needs))
  .filter((m) => (m.created ?? 0) >= since)
  .map((m) => ({
    id: m.id,
    date: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : '-',
    in: perM(m.pricing?.prompt),
    out: perM(m.pricing?.completion),
    cached: perM(m.pricing?.input_cache_read),
    ctx: m.context_length ?? '-',
    tools: (m.supported_parameters ?? []).includes('tools') ? 'yes' : 'no',
    price: otherPrices(m.pricing),
  }));

// Priced models first, cheapest output first; variable (negative) and zero prices go last, since a
// zero would otherwise sort to the top and look like the cheapest model. Only for the local 'price' order.
const rows = sort === 'price'
  ? listed.sort((a, b) => priceRank(a.out) - priceRank(b.out) || (a.out ?? 0) - (b.out ?? 0))
  : listed;

// Applied after the sort, so with top-weekly each family keeps its most used models.
const shown = families !== undefined ? capPerFamily(rows, families) : rows;
const perFamily = new Set(shown.map((r) => familyOf(r.id)));

console.log(['id', 'released', 'in/M', 'out/M', 'cached-in/M', 'context', 'tools', 'price'].join('\t'));
for (const r of shown) console.log([r.id, r.date, fmt(r.in), fmt(r.out), fmt(r.cached), r.ctx, r.tools, r.price].join('\t'));
console.error(`${shown.length} models, ${perFamily.size} families`);
// Free tiers often log prompts for training: a reminder before anyone routes real data through them.
if (shown.some((r) => r.id.endsWith(':free'))) console.error('(free tiers listed: check their data policy)');
