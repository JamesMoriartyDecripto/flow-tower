// Checks that each cited article was in force in the tax period, and flags unsafe authorities.
// Usage: node scripts/check_in_force.mjs --dry-run
//        node scripts/check_in_force.mjs --memo <draft.json> --library <records.json> --registry <registry.json>
//
// Why: the law that applies follows the tax period, not today's date. An article repealed before the
// period, or an old text used for a period from 1/1/2027, is an error the commercialista must see.
// A press source is a lead only (weights in config/source-registry.yaml), so it can never be the authority.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// Texts repealed by the testi unici from 1/1/2027 (primary-sources.md, section 7). Only the acts named
// in the notes are listed: the concordance tables are not published, so no article-level mapping here.
const REPLACED_FROM = '2027-01-01';
const REPLACED_ACTS = ['DPR 917/1986', 'DPR 633/1972', 'DPR 600/1973', 'DPR 602/1973', 'DPR 131/1986'];

// Dry-run cases: an article in force; an article repealed before the period; a press source cited as law.
const DRY = {
  period: { from: '2026-01-01', to: '2026-12-31' },
  registry: { 'press-fisco-oggi': 'press', 'tuir-dpr-917-1986': 'law' },
  citations: [
    { claim: 'c1', act: 'DPR 917/1986', article: 'art. 109', source_id: 'tuir-dpr-917-1986',
      in_force_from: '1986-12-22', in_force_to: null },
    { claim: 'c2', act: 'DPR 917/1986', article: 'art. 1', source_id: 'tuir-dpr-917-1986',
      in_force_from: '1987-01-01', in_force_to: '2025-06-30' },
    { claim: 'c3', act: 'FiscoOggi article', article: 'n/a', source_id: 'press-fisco-oggi',
      in_force_from: '2020-01-01', in_force_to: null },
  ],
};

const input = dryRun ? DRY : null;
const memo = dryRun ? { citations: input.citations } : JSON.parse(readFileSync(opt('--memo'), 'utf8'));
const period = dryRun ? input.period : memo.period;
const kindOf = dryRun
  ? input.registry
  : Object.fromEntries(JSON.parse(readFileSync(opt('--registry'), 'utf8')).map((s) => [s.id, s.kind]));

const flags = (c) => {
  const out = [];
  // ISO dates compare correctly as strings. A null in_force_to means still in force.
  if (c.in_force_from > period.to) out.push('not yet in force in the period');
  if (c.in_force_to && c.in_force_to < period.from) out.push('repealed before the period');
  if (period.to >= REPLACED_FROM && REPLACED_ACTS.includes(c.act)) {
    out.push(`${c.act} replaced by the testi unici from ${REPLACED_FROM}: map to the new article`);
  }
  if (kindOf[c.source_id] === 'press') out.push('press source used as authority: lead only');
  return out;
};

const results = memo.citations.map((c) => {
  const issues = flags(c);
  return { claim: c.claim, article: c.article, result: issues.length ? 'flag' : 'ok', issues };
});
const flagged = results.filter((r) => r.result === 'flag').length;
console.log(JSON.stringify({ dry_run: dryRun, period, flagged, results }, null, 2));
// Flags are for the reviewer, so the script reports them without failing the run.
