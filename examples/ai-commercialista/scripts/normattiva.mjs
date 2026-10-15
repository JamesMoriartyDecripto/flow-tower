// Builds point-in-time Normattiva links and runs a simple search on the open data API.
// Usage: node scripts/normattiva.mjs --dry-run [--date 2026-10-15]
//        node scripts/normattiva.mjs --search "testo ricerca"
//
// Why the URN link: the URN with !vig=<date> gives the text in force on a given day, which is the
// date rule the system needs (the law follows the tax period). The link is stable and citable.
// Why the search, not the article detail: the per-article detail endpoint (atto/dettaglio-atto-urn)
// returned {"code":"1000","message":"Errore generico..."} on 2026-10-15 for both the spec example and
// TUIR art. 109. The simple search worked the same day, so the live call uses it.
// Normattiva is not official: cite the Gazzetta Ufficiale ELI for the official text.
const API = 'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1';
const RESOLVER = 'https://www.normattiva.it/uri-res/N2Ls?';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const date = opt('--date', '2026-10-15');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad --date: ${date}`);

// URN:NIR form from the API spec (sec. 1.3.3): urn:nir:<authority>:<type>:<act date>;<number>[~artN][!vig=<date>]
function urnLink({ type, actDate, number, article, vig }) {
  const urn = `urn:nir:stato:${type}:${actDate};${number}${article ? `~art${article}` : ''}${vig ? `!vig=${vig}` : ''}`;
  return { urn, link: `${RESOLVER}${urn}` };
}

// TUIR, D.P.R. 22/12/1986 n. 917, art. 109.
const tuir109 = urnLink({
  type: 'decreto.del.presidente.della.repubblica',
  actDate: '1986-12-22',
  number: 917,
  article: 109,
  vig: date,
});

async function simpleSearch(text) {
  // The body follows the spec: testoRicerca and orderType. Paging is not sent: its exact shape
  // is not in our notes, so the server default page is used.
  const res = await fetch(`${API}/ricerca/semplice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ testoRicerca: text, orderType: 'recente' }),
  });
  if (!res.ok) throw new Error(`normattiva search HTTP ${res.status}`);
  return res.json();
}

if (dryRun) {
  console.log(JSON.stringify({ dry_run: true, date, tuir_art_109: tuir109 }, null, 2));
} else {
  const text = opt('--search', null);
  if (!text) throw new Error('give --search "testo" or --dry-run');
  const data = await simpleSearch(text);
  console.log(JSON.stringify({ date, query: text, result: data }, null, 2));
}
