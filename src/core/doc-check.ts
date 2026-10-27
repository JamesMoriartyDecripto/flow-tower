/*
 * The blocking checks of `flow-tower export --pdf`. Pure: the CLI collects the facts from the printed
 * page and from the workspace, this file says which check failed. A failed check stops the export, so
 * a wrong file is never written. Every check is listed, so one run shows all the problems at once.
 */

/** What the CLI read from the printed document page. */
export interface DomFacts {
  /** The `data-doc-error` message, or undefined when the page did not fail. */
  docError?: string;
  /** Whether the "Building the document…" placeholder is still on the page. */
  buildingText: boolean;
  /** The text of `main`, with every node label, layer title and so on, without the appendix's printed file sources. */
  mainText: string;
  /** Layer titles shown in the layer headings. */
  layerTitles: string[];
  /** Node labels shown in the node tables and details. */
  nodeLabels: string[];
  /** Values of every `a[href^="#"]`. */
  hrefs: string[];
  /** The ids of every element with an id attribute. */
  ids: string[];
  /** The counts in the document control table. */
  control: { layers: number; nodes: number; subTowers: number };
  /** The chapter ids of the printed towers (`towerId`s), as the page shows them. */
  chapters: string[];
  /** Every appendix entry shown on the page: its `fileKey`, and whether its text or a reason is printed. */
  appendix: { key: string; printed: boolean }[];
  /** Per chapter (its `data-tower`): how many `[data-chart]` figures the chapter holds. */
  charts: { towerId: string; count: number }[];
}

/** The fewest charts a chapter must print at level 2 and up: the overview's figures, not optional extras. */
export const MIN_CHARTS = 5;

/** What the workspace says the document must contain. */
export interface WorkspaceFacts {
  /** The tower that was printed. */
  towerId: string;
  /** Every tower included at this level: the root first, then its chapters, as `towerDoc` lists them. */
  chapters: { towerId: string; layerTitles: string[]; nodeLabels: string[] }[];
  /** The control counts the workspace implies for this level. */
  counts: { layers: number; nodes: number; subTowers: number };
  /** The level printed. The chart check applies at 2 and up; absent means the check does not apply. */
  level?: 1 | 2 | 3 | 4;
  /** Level 3: every file the appendix must list, as `fileKey` (tower and path). Empty below level 3. */
  files: string[];
  /** Towers the document must print: the root and every reachable tower, once each. */
  towers: string[];
  /** Pages in the written PDF, when it was written; undefined before the file exists. */
  pdfPages?: number;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  /** Why it failed: the first few missing items, or the mismatch. Empty when ok. */
  detail: string;
}

const MAX_LISTED = 5;

/** The items of `wanted` that `have` does not contain, shown as a short list. */
function missing(wanted: string[], have: string[]): string[] {
  const set = new Set(have);
  return [...new Set(wanted)].filter((w) => !set.has(w));
}

function listed(items: string[]): string {
  const head = items.slice(0, MAX_LISTED).map((i) => `"${i}"`).join(', ');
  return items.length > MAX_LISTED ? `${head} and ${items.length - MAX_LISTED} more` : head;
}

/** A check that lists what is missing; passes when nothing is. */
function listCheck(name: string, wanted: string[], have: string[]): CheckResult {
  const gone = missing(wanted, have);
  return gone.length
    ? { name, ok: false, detail: `${gone.length} missing: ${listed(gone)}` }
    : { name, ok: true, detail: '' };
}

/**
 * Every check, in the order they are reported. The document must have printed without error, hold every
 * layer, node and sub-tower the level promises, count them the same as the workspace, link only to targets
 * that exist, carry no raw JSON, and produce a PDF with at least one page per chapter and layer.
 */
export function checkDocument(dom: DomFacts, ws: WorkspaceFacts): CheckResult[] {
  const results: CheckResult[] = [];

  // a. The page reached the finished state without an error.
  const loaded = !dom.docError && !dom.buildingText;
  results.push({
    name: 'document rendered',
    ok: loaded,
    detail: dom.docError ? `page error: ${dom.docError}` : dom.buildingText ? 'still "Building the document…"' : '',
  });

  // b. Every layer title, node label and chapter is on the page.
  const layerWanted = ws.chapters.flatMap((c) => c.layerTitles);
  results.push(listCheck('every layer title shown', layerWanted, dom.layerTitles));
  const nodeWanted = ws.chapters.flatMap((c) => c.nodeLabels);
  results.push(listCheck('every node label shown', nodeWanted, dom.nodeLabels));

  // b2. Every tower of the project is a chapter, and every file of the project is in the appendix.
  results.push(listCheck('every tower is a chapter', ws.towers, dom.chapters));
  if (ws.files.length > 0 || dom.appendix.length > 0) {
    results.push(listCheck('every referenced file in the appendix', ws.files, dom.appendix.map((a) => a.key)));
    // A listed file must also carry its text or its reason, never an empty entry.
    const blank = dom.appendix.filter((a) => !a.printed).map((a) => a.key);
    results.push({
      name: 'every appendix file has text or a reason',
      ok: blank.length === 0,
      detail: blank.length ? `${blank.length} blank: ${listed(blank)}` : '',
    });
  }

  // c. The control table counts equal the workspace's.
  const mismatched = (['layers', 'nodes', 'subTowers'] as const).filter((k) => dom.control[k] !== ws.counts[k]);
  results.push({
    name: 'control counts match the workspace',
    ok: mismatched.length === 0,
    detail: mismatched.map((k) => `${k}: page ${dom.control[k]}, workspace ${ws.counts[k]}`).join('; '),
  });

  // d. In-page links resolve, and no raw JSON leaks into the text.
  const targets = new Set(dom.ids);
  const dead = [...new Set(dom.hrefs)].filter((h) => !targets.has(decodeSafe(h.slice(1))));
  results.push({
    name: 'every in-page link has a target',
    ok: dead.length === 0,
    detail: dead.length ? `${dead.length} dead: ${listed(dead)}` : '',
  });
  const raw = dom.mainText.includes('{"');
  results.push({ name: 'no raw JSON in the text', ok: !raw, detail: raw ? 'found {" in the text' : '' });

  // d2. Every chapter at level 2 and up carries its overview charts: a chapter with too few is a gap a reader
  // would take for the whole chart set missing, so each chapter is named.
  if (ws.level !== undefined && ws.level >= 2) {
    const short = ws.chapters
      .map((c) => ({ towerId: c.towerId, count: dom.charts.find((x) => x.towerId === c.towerId)?.count ?? 0 }))
      .filter((c) => c.count < MIN_CHARTS);
    results.push({
      name: 'every chapter has its overview charts',
      ok: short.length === 0,
      detail: short.length ? `${short.length} short: ${short.map((c) => `"${c.towerId}" has ${c.count}`).slice(0, MAX_LISTED).join(', ')}` : '',
    });
  }

  // e. The PDF has at least as many pages as chapters plus layers.
  const need = ws.chapters.length + layerWanted.length;
  const pages = ws.pdfPages;
  results.push({
    name: 'PDF has a page per chapter and layer',
    ok: pages !== undefined && pages >= need,
    detail: pages === undefined ? 'no PDF was written' : pages >= need ? '' : `${pages} pages, need at least ${need}`,
  });

  return results;
}

/** An href fragment is percent-encoded; a bad encoding is kept as is, so the id check still fails for it. */
function decodeSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** The checks that failed, for the CLI to print. Empty means the export may proceed. */
export function failedChecks(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => !r.ok);
}

/**
 * The `towers n/n, files n/n` the CLI prints: how many of the project's towers and referenced files the page
 * holds, against how many the workspace has. A count that is short is the one a reader should look at.
 */
export function coverage(dom: DomFacts, ws: WorkspaceFacts): { towers: [number, number]; files: [number, number] } {
  const chapters = new Set(dom.chapters);
  const shown = new Set(dom.appendix.filter((a) => a.printed).map((a) => a.key));
  return {
    towers: [ws.towers.filter((t) => chapters.has(t)).length, ws.towers.length],
    files: [ws.files.filter((f) => shown.has(f)).length, ws.files.length],
  };
}
