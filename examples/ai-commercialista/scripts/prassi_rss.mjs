// Lists new Agenzia Entrate "normativa e prassi" items (type and date) from the RSS feed.
// Usage: node scripts/prassi_rss.mjs --dry-run
//        node scripts/prassi_rss.mjs [--since 2026-10-01]
//
// Why RSS: the Agency has no API, and its listing pages are not predictable. The feed is the live
// machine route (verified 2026-10-15). The feed URL is complete in research/primary-sources.md, so it
// is fixed here; the URL is not built from parts. Document links are never constructed: the item link
// is taken from the feed as-is.
const FEED = 'https://www.agenziaentrate.gov.it/portale/c/portal/rss/entrate?idrss=0753fcb1-1a42-4f8c-f40d-02793c6aefb4';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const since = opt('--since', '1900-01-01');

// Item dates are formatted in Italian time. In UTC, an item published between 00:00 and 02:00 Rome
// time falls on the previous day, and --since would miss it.
const romeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });

// Inline two-item sample in the RSS 2.0 shape, used only by --dry-run (no network).
const DRY_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>[SAMPLE] Risposta n. 000 del 15/10/2026 - IVA su servizi CER</title>
<link>https://www.agenziaentrate.gov.it/portale/documents/sample-185</link>
<pubDate>Thu, 15 Oct 2026 10:00:00 +0200</pubDate></item>
<item><title>[SAMPLE] Circolare n. 0/E del 6 ottobre 2026 - Chiarimenti</title>
<link>https://www.agenziaentrate.gov.it/portale/documents/sample-8e</link>
<pubDate>Tue, 06 Oct 2026 09:00:00 +0200</pubDate></item>
</channel></rss>`;

// Type comes from the title prefix, which is how the Agency names its documents. Anything else is "altro".
function typeOf(title) {
  // The [SAMPLE] tag marks dry-run items; it is not part of the Agency's title, so strip it first.
  const t = title.replace(/^\[SAMPLE\]\s*/, '');
  if (/^circolare/i.test(t)) return 'circolare';
  if (/^risoluzione/i.test(t)) return 'risoluzione';
  if (/^risposta/i.test(t)) return 'risposta a interpello';
  if (/^provvedimento/i.test(t)) return 'provvedimento';
  return 'altro';
}

// Plain regex parsing: the feed is simple RSS 2.0, and the script has no dependencies.
// CDATA wrappers are removed so titles compare cleanly.
function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const field = (tag) => {
      const f = m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return f ? f[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
    };
    const title = field('title');
    const date = new Date(field('pubDate'));
    items.push({
      title,
      type: typeOf(title),
      date: Number.isNaN(date.getTime()) ? null : romeDay.format(date),
      link: field('link'),
    });
  }
  return items;
}

const xml = dryRun
  ? DRY_XML
  : await (async () => {
      // A timeout keeps a hung feed from stalling the scheduled run.
      const res = await fetch(FEED, {
        headers: { Accept: 'application/rss+xml, application/xml' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`AdE feed HTTP ${res.status}`);
      return res.text();
    })();

// "New" means published after --since (default: all). The caller keeps the last seen date.
const items = parseItems(xml).filter((it) => it.date && it.date >= since);
console.log(JSON.stringify({ dry_run: dryRun, since, count: items.length, items }, null, 2));
