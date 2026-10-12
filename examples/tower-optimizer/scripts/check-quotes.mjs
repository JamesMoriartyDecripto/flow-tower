#!/usr/bin/env node
// Phase 5 (review check): keep only the review findings whose quote really sits in the node they name.
//   node scripts/check-quotes.mjs <tower.yaml> <findings.json> [--out kept.json]
// Findings are { node: "layer.node" | "tower", quote, ... }. A finding passes only when its quote, after
// whitespace is normalised, occurs in that node's own lines, so a quote lifted from a neighbour is dropped.
// Plain line scan, no YAML parser: scripts here have no dependencies. Exit 0 whatever is dropped.
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

/** Collapses every run of whitespace to one space, so line wrapping in the YAML does not matter. */
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const indentOf = (line) => line.length - line.trimStart().length;

/** A `- id: x` line, with its indent and id; null for any other line. */
function idLine(line) {
  const m = /^(\s*)-\s+id:\s*(.+?)\s*$/.exec(line);
  return m ? { indent: m[1].length, id: m[2].replace(/^["']|["']$/g, '') } : null;
}

/**
 * Index just past the block that starts at `start`. A block's body is always indented deeper than its
 * own line, so the block ends at the first non-blank line at the same indent or shallower: a sibling
 * item (the next node or layer) or the next top-level key (`prompts:` after `layers:`).
 */
function blockEnd(lines, start) {
  const d = indentOf(lines[start]);
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() !== '' && indentOf(line) <= d) break;
    end++;
  }
  return end;
}

/**
 * The raw text of one node, from its `- id:` line to the end of its block, or null when the key does not
 * name a node. The key is "layer.node"; the search stays inside the `layers:` section so a node that shares
 * a layer's id is never mistaken for the layer.
 */
export function nodeText(yamlText, key) {
  const dot = String(key).indexOf('.');
  if (dot <= 0 || dot === key.length - 1) return null;
  const layer = key.slice(0, dot);
  const node = key.slice(dot + 1);
  const lines = yamlText.split(/\r?\n/);
  const secAt = lines.findIndex((l) => /^layers:\s*$/.test(l));
  if (secAt < 0) return null;
  const secEnd = blockEnd(lines, secAt);
  for (let li = secAt + 1; li < secEnd; li++) {
    const lh = idLine(lines[li]);
    if (!lh || lh.id !== layer) continue;
    const lEnd = blockEnd(lines, li);
    for (let i = li + 1; i < lEnd; i++) {
      const nh = idLine(lines[i]);
      if (nh && nh.id === node && nh.indent > lh.indent) return lines.slice(i, blockEnd(lines, i)).join('\n');
    }
    return null;
  }
  return null;
}

/**
 * Splits findings into kept and dropped. A dropped one carries the reason, so the report can say why.
 * For `tower` the quote is searched in the whole file; for a node, in that node's text only.
 */
export function checkQuotes(yamlText, findings) {
  const kept = [];
  const dropped = [];
  const fileText = norm(yamlText);
  for (const f of findings) {
    const quote = norm(f?.quote);
    if (!quote) {
      dropped.push({ finding: f, reason: 'empty quote' });
      continue;
    }
    if (f?.node === 'tower') {
      if (fileText.includes(quote)) kept.push(f);
      else dropped.push({ finding: f, reason: 'quote not found in the tower file' });
      continue;
    }
    const text = typeof f?.node === 'string' ? nodeText(yamlText, f.node) : null;
    if (text === null) dropped.push({ finding: f, reason: `no such node: ${f?.node ?? '(missing)'}` });
    else if (norm(text).includes(quote)) kept.push(f);
    else dropped.push({ finding: f, reason: `quote not found in node ${f.node}` });
  }
  return { kept, dropped };
}

function main() {
  const args = argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  // Only the `--out` pair is removed. Without the flag, outAt is -1, so nothing may be skipped.
  const files = args.filter((_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1));
  if (files.length !== 2 || (outAt >= 0 && !out)) {
    console.error('usage: check-quotes.mjs <tower.yaml> <findings.json> [--out kept.json]');
    exit(2);
  }
  const [towerFile, findingsFile] = files;
  const findings = JSON.parse(readFileSync(findingsFile, 'utf8'));
  if (!Array.isArray(findings)) {
    console.error('findings.json must be a JSON array');
    exit(2);
  }
  const { kept, dropped } = checkQuotes(readFileSync(towerFile, 'utf8'), findings);
  console.log(`kept ${kept.length}, dropped ${dropped.length}`);
  for (const d of dropped) console.log(`  dropped ${d.finding?.node ?? '(no node)'}: ${d.reason}`);
  if (out) writeFileSync(out, `${JSON.stringify(kept, null, 2)}\n`);
  exit(0);
}

// Run the CLI only when this file is the entry point, so the tests can import the pure functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
