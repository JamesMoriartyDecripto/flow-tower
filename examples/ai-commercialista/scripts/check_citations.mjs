// Checks that each cited span appears verbatim in its stored source.
// Usage: node scripts/check_citations.mjs --dry-run
//        node scripts/check_citations.mjs --memo <draft.json> --sources <sources.json>
//
// Why: the drafter may paraphrase while believing it quotes. A quote that is not in the stored text
// is a broken citation, whatever the model says. Only whitespace is normalized (PDF and HTML line
// breaks would cause false failures); any other difference, such as a changed number, fails.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// Illustrative sample text, not statute text. Real sources come from the library store.
const DRY_SOURCES = [
  {
    id: 'sample-source',
    text: 'Sample text for the dry run.\nThe cost of an asset is deductible from the year it enters use.',
  },
];
const DRY_MEMO = {
  claims: [
    {
      id: 'claim-pass',
      source_id: 'sample-source',
      cited_text: 'The cost of an asset is deductible from the year it enters use.',
    },
    {
      id: 'claim-fail',
      source_id: 'sample-source',
      cited_text: 'The cost of an asset is deductible in every year.',
    },
  ],
};

const memo = dryRun ? DRY_MEMO : JSON.parse(readFileSync(opt('--memo'), 'utf8'));
const sources = dryRun ? DRY_SOURCES : JSON.parse(readFileSync(opt('--sources'), 'utf8'));
const byId = new Map(sources.map((s) => [s.id, s]));

const results = memo.claims.map((c) => {
  const quote = norm(c.cited_text ?? '');
  const src = byId.get(c.source_id);
  // An empty quote would match every text, so it is rejected explicitly.
  if (!quote) return { claim: c.id, result: 'fail', reason: 'empty cited_text' };
  if (!src) return { claim: c.id, result: 'fail', reason: `source ${c.source_id} not in store` };
  const found = norm(src.text).includes(quote);
  return {
    claim: c.id,
    source_id: c.source_id,
    result: found ? 'pass' : 'fail',
    reason: found ? null : 'cited_text not found verbatim in source',
  };
});

const failed = results.filter((r) => r.result === 'fail').length;
console.log(JSON.stringify({ dry_run: dryRun, passed: results.length - failed, failed, results }, null, 2));
// The dry run includes a failing claim on purpose, so only a real run sets the exit code.
if (!dryRun && failed > 0) process.exitCode = 1;
