// Replaces personal identifiers with stable placeholders before text reaches a model.
// Usage: node scripts/redact.mjs [--dry-run] [--client data/sara-conti.json] [--text "..."] [--show-map]
//
// Why: no personal data in prompts (CNDCEC guide; GDPR). The same value always gets the same
// placeholder, so the model can still tell two mentions apart. The map (placeholder -> value)
// holds the real personal data, so it is printed to stderr only with --show-map, for local use.
// Without the flag nothing goes to stderr, because logs and CI capture it. The map never goes to stdout.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const showMap = args.includes('--show-map');
const client = JSON.parse(readFileSync(resolve(root, opt('--client', 'data/lumen-grid.json')), 'utf8'));
const text = opt('--text',
  `Fattura per ${client.name}, P.IVA ${client.vat_number}, CF ${client.tax_code}. ` +
  `Contatto ${client.contact?.name ?? ''} <${client.contact?.email ?? ''}>, tel +39 333 0000000, ` +
  `IBAN IT00X0000000000000000000000. Codice fiscale di controllo XXXXXX00X00X000X.`);

// Order matters: specific patterns first, so a name or company inside an email is not split.
const PATTERNS = [
  ['IBAN', /\bIT\d{2}[A-Z]\d{22}\b/g],
  ['EMAIL', /[\w.+-]+@[\w-]+(\.[\w-]+)+/g],
  // The CF pattern is loose on purpose: sample codes such as CNTXXX00X00X000X use letters where
  // the real rules would use month codes, and a leak is worse than an over-match.
  ['CF', /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g],
  // Any 11-digit run is redacted on purpose: a leaked VAT number is worse than an over-match, so
  // invoice numbers of 11 digits are redacted too.
  ['PIVA', /\b(IT)?\d{11}\b/g],
  ['PHONE', /(\+39\s?)?\b3\d{2}[\s-]?\d{6,7}\b/g],
];

const map = new Map(); // value -> placeholder
const counters = {};
function placeholder(kind, value) {
  if (!map.has(value)) {
    counters[kind] = (counters[kind] ?? 0) + 1;
    map.set(value, `[${kind}_${counters[kind]}]`);
  }
  return map.get(value);
}

// Names from the client file are matched literally (escaped), longest first, so "Mario Example"
// wins over a shorter overlap.
const names = [client.name, client.contact?.name].filter(Boolean)
  .sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let out = text;
for (const name of names) {
  out = out.replace(new RegExp(escape(name), 'g'), () => placeholder('NAME', name));
}
for (const [kind, re] of PATTERNS) {
  out = out.replace(re, (m) => placeholder(kind, m));
}

// The map is the only place where real values appear. It is opt-in and goes to stderr, never to stdout.
if (showMap) {
  console.error('LOCAL ONLY, do not send to a model. Placeholder map:');
  console.error(JSON.stringify(Object.fromEntries([...map].map(([v, p]) => [p, v])), null, 2));
}
console.log(JSON.stringify({ estimate: false, redacted_text: out, placeholders: map.size }, null, 2));
