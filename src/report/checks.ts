/*
 * The blocking checks of the report engine. Pure: it reads the document model and the rendered html and says
 * which rule failed. A report is written only when every blocking check passes, so a wrong file never leaves
 * the engine. Every check runs, so one pass shows all the problems at once. The sources check is a warning:
 * an unused source is worth a look, but it does not stop the report.
 */

import { renderReport } from './html.ts';
import type { Block, Finding, ReportDoc, Section } from './model.ts';

export interface ReportCheck {
  id: string;
  ok: boolean;
  /** Why it failed, or what is unused for a warning. Empty when it passes. */
  detail: string;
  /** A `block` stops the report; a `warn` is shown and the report is still written. */
  level: 'block' | 'warn';
}

export interface RequiredSections {
  sections: string[];
}

const MAX_LISTED = 5;

function listed(items: string[]): string {
  const head = items.slice(0, MAX_LISTED).map((i) => `"${i}"`).join(', ');
  return items.length > MAX_LISTED ? `${head} and ${items.length - MAX_LISTED} more` : head;
}

function block(id: string, bad: string[], what: string): ReportCheck {
  return bad.length
    ? { id, ok: false, detail: `${bad.length} ${what}: ${listed(bad)}`, level: 'block' }
    : { id, ok: true, detail: '', level: 'block' };
}

/** Every section in the tree, the top level and every nested one, in document order. */
function allSections(sections: readonly Section[]): Section[] {
  return sections.flatMap((s) => [s, ...allSections(s.sections ?? [])]);
}

function allBlocks(doc: ReportDoc): Block[] {
  return allSections(doc.sections).flatMap((s) => s.blocks);
}

function allFindings(blocks: readonly Block[]): Finding[] {
  return blocks.flatMap((b) => (b.kind === 'findings' ? b.items : []));
}

/** The citations the document makes: from text blocks and from findings. */
function citesOf(blocks: readonly Block[]): string[] {
  const fromText = blocks.flatMap((b) => (b.kind === 'text' ? b.cites ?? [] : []));
  const fromFindings = allFindings(blocks).flatMap((f) => f.cites ?? []);
  return [...fromText, ...fromFindings];
}

/**
 * Every string a reader sees in the body. The raw-data check reads these, so a JSON dump is caught wherever
 * it would be printed: in prose, in a table cell, or in a fact value.
 */
function visibleStrings(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b): string[] => {
    switch (b.kind) {
      case 'text':
        return [b.text];
      case 'facts':
        return b.rows.flatMap(([k, v]) => [k, String(v)]);
      case 'table':
        return [...(b.caption ? [b.caption] : []), ...b.columns, ...b.rows.flat().map(String)];
      case 'findings':
        return b.items.flatMap((f) => [f.title, f.detail, f.ref ?? '', f.recommendation ?? '', f.status ?? '']);
      case 'bars':
        return [b.caption, ...b.items.map((i) => i.label)];
      case 'status':
        return b.items.flatMap((i) => [i.label, i.note ?? '']);
      case 'list':
        return b.items;
    }
  });
}

/** The values a facts or table block lists, as text: a source named there counts as used. */
function listedValues(blocks: readonly Block[]): Set<string> {
  const values = blocks.flatMap((b): string[] => {
    if (b.kind === 'facts') return b.rows.map(([, v]) => String(v));
    if (b.kind === 'table') return b.rows.flat().map(String);
    return [];
  });
  return new Set(values);
}

function checkSections(doc: ReportDoc, required: RequiredSections): ReportCheck {
  const have = new Set(allSections(doc.sections).map((s) => s.id));
  return block('sections', required.sections.filter((id) => !have.has(id)), 'required section missing');
}

function checkNotEmpty(doc: ReportDoc): ReportCheck {
  // An empty section is a heading with nothing under it, which a reader would take for missing content.
  const empty = allSections(doc.sections)
    .filter((s) => s.blocks.length === 0 && (s.sections ?? []).length === 0)
    .map((s) => s.id);
  return block('not-empty', empty, 'empty section');
}

function checkFindingIds(doc: ReportDoc): ReportCheck {
  // Finding ids are how a reader and the sources refer to a finding, so each must be unique and present.
  const ids = allFindings(allBlocks(doc)).map((f) => f.id);
  const blank = ids.filter((id) => id.trim() === '').length;
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const dupes = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  const problems = [
    ...(blank ? [`${blank} empty`] : []),
    ...(dupes.length ? [`duplicate ${listed(dupes)}`] : []),
  ];
  return {
    id: 'finding-ids',
    ok: problems.length === 0,
    detail: problems.join('; '),
    level: 'block',
  };
}

function checkCites(doc: ReportDoc): ReportCheck {
  const blocks = allBlocks(doc);
  const sourceIds = new Set(doc.sources.map((s) => s.id));
  const unknown = [...new Set(citesOf(blocks).filter((id) => !sourceIds.has(id)))];
  // A draft is a model's prose, so it must point at the sources it was drawn from.
  const uncited = blocks.filter((b) => b.kind === 'text' && b.origin === 'draft' && !(b.cites?.length));
  const problems = [
    ...(unknown.length ? [`${unknown.length} unknown source: ${listed(unknown)}`] : []),
    ...(uncited.length ? [`${uncited.length} draft text without a cite`] : []),
  ];
  return { id: 'cites', ok: problems.length === 0, detail: problems.join('; '), level: 'block' };
}

function checkDraftNumbers(doc: ReportDoc): ReportCheck {
  // Numbers come from data blocks, which the engine computed. A digit in a draft is a number a model made up.
  const withDigits = allBlocks(doc).filter(
    (b): b is Extract<Block, { kind: 'text' }> => b.kind === 'text' && b.origin === 'draft' && /\d/.test(b.text),
  );
  return block('draft-numbers', withDigits.map((b) => b.text), 'draft text with digits');
}

function checkRawData(doc: ReportDoc): ReportCheck {
  const raw = visibleStrings(allBlocks(doc)).filter((s) => s.includes('{"') || s.includes('[{'));
  return block('raw-data', raw, 'raw JSON string');
}

function checkLinks(html: string): ReportCheck {
  const targets = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]));
  const hrefs = [...new Set([...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]))];
  return block('links', hrefs.filter((h) => !targets.has(h)), 'dead in-page link');
}

/** A source is used when a cite names it or a facts or table block lists it. Unused is a warning only. */
function checkSourcesUsed(doc: ReportDoc): ReportCheck {
  const blocks = allBlocks(doc);
  const cited = new Set(citesOf(blocks));
  const listedIds = listedValues(blocks);
  const unused = doc.sources.map((s) => s.id).filter((id) => !cited.has(id) && !listedIds.has(id));
  return {
    id: 'sources-used',
    ok: true,
    detail: unused.length ? `unused: ${listed(unused)}` : '',
    level: 'warn',
  };
}

/** Rendering is pure, so the same model must give the same bytes; a clock or a random id would break it. */
function checkDeterministic(doc: ReportDoc): ReportCheck {
  // The renderer refuses some bad models outright (an unknown cite, an uncited draft). Those are already
  // reported by the checks above, so a render error is a failure here, not a crash of the whole run.
  try {
    const same = renderReport(doc) === renderReport(doc);
    return {
      id: 'deterministic',
      ok: same,
      detail: same ? '' : 'two renders of the same document differ',
      level: 'block',
    };
  } catch (e) {
    return { id: 'deterministic', ok: false, detail: `render failed: ${(e as Error).message}`, level: 'block' };
  }
}

/** Every check, in the order they are reported. The html is the rendered report the caller already holds. */
export function checkReport(doc: ReportDoc, html: string, required: RequiredSections): ReportCheck[] {
  return [
    checkSections(doc, required),
    checkNotEmpty(doc),
    checkFindingIds(doc),
    checkCites(doc),
    checkDraftNumbers(doc),
    checkRawData(doc),
    checkLinks(html),
    checkSourcesUsed(doc),
    checkDeterministic(doc),
  ];
}

/** The blocking checks that failed. Empty means the report may be written; warnings never appear here. */
export function failed(results: ReportCheck[]): ReportCheck[] {
  return results.filter((r) => r.level === 'block' && !r.ok);
}
