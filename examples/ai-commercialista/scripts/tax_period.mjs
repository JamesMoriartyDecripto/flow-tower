// Picks the tax period, the regime and the law set for a client question.
// Usage: node scripts/tax_period.mjs [--dry-run] [--client data/lumen-grid.json] [--fy 2026] [--question-date 2026-10-15]
//
// Why: the law version follows the tax period (the fiscal year the event belongs to), not today's date.
// A question asked in 2027 about FY2026 still gets the old texts.
// The switch date is read from config/article-map-2027.yaml (applies_from), by line parsing, no YAML dependency.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const questionDate = opt('--question-date', '2026-10-15');
const client = JSON.parse(readFileSync(resolve(root, opt('--client', 'data/lumen-grid.json')), 'utf8'));
// The client files carry no tax year for the question, so the period defaults to the question's year.
const fy = Number(opt('--fy', questionDate.slice(0, 4)));

// Earliest applies_from among the testi unici. The file's own rule: pick the text by period, never by today's date.
function readTestiUniciStart() {
  const text = readFileSync(resolve(root, 'config/article-map-2027.yaml'), 'utf8');
  const dates = [...text.matchAll(/^\s+applies_from:\s*"(\d{4}-\d{2}-\d{2})"/gm)].map((m) => m[1]);
  if (dates.length === 0) throw new Error('no applies_from in config/article-map-2027.yaml');
  return dates.sort()[0];
}

const LAWS_OLD = ['DPR 917/1986 (TUIR)', 'DPR 633/1972 (IVA)'];
const LAWS_TU = ['D.Lgs. 117/2026 (new TUIR, 377 articles)', 'D.Lgs. 10/2026 (testo unico IVA)'];

function lawSetFor(from, to, switchDate) {
  // Dates are ISO strings, so string comparison is correct.
  if (to < switchDate) return { law_set: 'old', laws: LAWS_OLD, note: null };
  if (from >= switchDate) return { law_set: 'testi-unici', laws: LAWS_TU, note: null };
  // A period that straddles the switch follows transitional rules that are not mapped yet.
  return {
    law_set: 'straddle',
    laws: [...LAWS_OLD, ...LAWS_TU],
    note: 'Period straddles the switch: transitional rules are not mapped (article-map-2027 unmapped). Human review.',
  };
}

const from = `${fy}-01-01`;
const to = `${fy}-12-31`;
const switchDate = readTestiUniciStart();
const { law_set, laws, note } = lawSetFor(from, to, switchDate);

const result = {
  estimate: false,
  client_id: client.id,
  question_date: questionDate,
  regime: client.regime,
  period: { fy, from, to },
  testi_unici_applies_from: switchDate,
  law_set,
  laws,
  notes: [
    'Article-level concordance tables are not published (article-map-2027.yaml): cite old articles only with the old text.',
    ...(note ? [note] : []),
  ],
};

console.log(JSON.stringify(result, null, 2));
