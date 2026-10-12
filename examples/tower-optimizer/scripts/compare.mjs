#!/usr/bin/env node
// Phase 6 (verify): what changed between two audit snapshots, per tower.
//   node scripts/compare.mjs <before.json> <after.json> [--md out.md]
// Exit 1 when any finding is new at level warning (a regression), else 0.
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

/** Inventory counters compared between snapshots; each is a plain number in the audit JSON. */
const INVENTORY_COUNTS = [
  ['layers', (inv) => inv.layers],
  ['nodes', (inv) => inv.nodes],
  ['edges', (inv) => inv.edges.total],
  ['agents', (inv) => inv.agents],
  ['withOps.budget', (inv) => inv.withOps.budget],
  ['withOps.limits', (inv) => inv.withOps.limits],
  ['withOps.approval', (inv) => inv.withOps.approval],
  ['withOps.evals', (inv) => inv.withOps.evals],
  ['withOps.sandbox', (inv) => inv.withOps.sandbox],
];

/**
 * A finding is identified by rule and node, not by its message: the message carries counts and
 * wording that can change without the problem changing. A missing node (tower-level) keys as ''.
 */
const keyOf = (f) => `${f.rule}\u0000${f.node ?? ''}`;

/**
 * Multiset matching: two findings with the same key on the same node are two findings, so fixing one
 * of two counts as one fixed, not zero. Returns the findings split into fixed, new and still open.
 */
function matchFindings(before = [], after = []) {
  const left = new Map();
  for (const f of before) left.set(keyOf(f), [...(left.get(keyOf(f)) ?? []), f]);
  const open = [];
  const added = [];
  for (const f of after) {
    const pool = left.get(keyOf(f));
    // Each before-finding can be matched once; an after-finding with no unmatched twin is new.
    if (pool?.length) {
      pool.shift();
      open.push(f);
    } else added.push(f);
  }
  // Whatever is still unmatched in the before list was fixed.
  const fixed = [...left.values()].flat();
  return { fixed, added, open };
}

/** Inventory deltas for the counters above. A tower missing on one side counts as zero there. */
function inventoryDeltas(before, after) {
  return INVENTORY_COUNTS.map(([name, get]) => {
    const b = before ? get(before) : 0;
    const a = after ? get(after) : 0;
    return { name, before: b, after: a, delta: a - b };
  });
}

/** Model changes per node key: a node is listed when its role or model differs, or it appears on one side only. */
function modelChanges(before = [], after = []) {
  const byNode = new Map(before.map((r) => [r.node, r]));
  const seen = new Set();
  const out = [];
  for (const a of after) {
    seen.add(a.node);
    const b = byNode.get(a.node);
    if (!b) out.push({ node: a.node, role: { before: undefined, after: a.role }, model: { before: undefined, after: a.model ?? null } });
    else if (b.role !== a.role || (b.model ?? null) !== (a.model ?? null)) {
      out.push({ node: a.node, role: { before: b.role, after: a.role }, model: { before: b.model ?? null, after: a.model ?? null } });
    }
  }
  for (const b of before) if (!seen.has(b.node)) out.push({ node: b.node, role: { before: b.role, after: undefined }, model: { before: b.model ?? null, after: undefined } });
  return out;
}

/**
 * Pure comparison of two audit snapshots (each `{ towers: [...] }`). Towers are matched by id.
 * `regression` is true when a finding that was not there before is at level warning.
 */
export function compare(before, after) {
  const bIndex = new Map((before.towers ?? []).map((t) => [t.id, t]));
  const aIndex = new Map((after.towers ?? []).map((t) => [t.id, t]));
  const ids = [...new Set([...bIndex.keys(), ...aIndex.keys()])];
  const towers = ids.map((id) => {
    const b = bIndex.get(id);
    const a = aIndex.get(id);
    const { fixed, added, open } = matchFindings(b?.findings, a?.findings);
    return {
      id,
      name: (a ?? b).name,
      status: !b ? 'added' : !a ? 'removed' : 'present',
      fixed,
      new: added,
      open,
      inventory: inventoryDeltas(b?.inventory, a?.inventory),
      models: modelChanges(b?.modelFit, a?.modelFit),
    };
  });
  const regression = towers.some((t) => t.new.some((f) => f.level === 'warning'));
  return { towers, regression };
}

const cell = (s) => String(s ?? '-').replace(/\|/g, '\\|');

function findingList(list) {
  if (!list.length) return ['_none_', ''];
  return [
    '| rule | node | level | message |',
    '| --- | --- | --- | --- |',
    ...list.map((f) => `| ${cell(f.rule)} | ${cell(f.node)} | ${cell(f.level)} | ${cell(f.message)} |`),
    '',
  ];
}

/** Markdown report: one section per tower, with the four parts of the verify phase in a fixed order. */
export function toMarkdown(result) {
  const lines = ['# Tower optimizer: before/after', ''];
  if (result.regression) lines.push('**Regression:** a new warning finding appeared.', '');
  if (!result.towers.length) lines.push('_no towers in either snapshot_', '');
  for (const t of result.towers) {
    lines.push(`## ${cell(t.id)} — ${cell(t.name)}`, '');
    if (t.status !== 'present') lines.push(`_tower ${t.status === 'added' ? 'added in after' : 'removed in after'}_`, '');
    lines.push('### Findings fixed', '', ...findingList(t.fixed));
    lines.push('### Findings new', '', ...findingList(t.new));
    lines.push('### Findings still open', '', ...findingList(t.open));
    lines.push('### Inventory', '', '| counter | before | after | delta |', '| --- | --- | --- | --- |');
    for (const r of t.inventory) lines.push(`| ${r.name} | ${r.before} | ${r.after} | ${r.delta > 0 ? '+' : ''}${r.delta} |`);
    lines.push('', '### Model changes', '');
    if (!t.models.length) lines.push('_none_', '');
    else {
      lines.push('| node | role | model |', '| --- | --- | --- |');
      for (const m of t.models) {
        const role = m.role.before === m.role.after ? cell(m.role.after) : `${cell(m.role.before)} → ${cell(m.role.after)}`;
        lines.push(`| ${cell(m.node)} | ${role} | ${cell(m.model.before)} → ${cell(m.model.after)} |`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = argv.slice(2);
  const mdAt = args.indexOf('--md');
  const md = mdAt >= 0 ? args[mdAt + 1] : undefined;
  const files = args.filter((a, i) => a !== '--md' && i !== mdAt + 1);
  if (files.length !== 2 || (mdAt >= 0 && !md)) {
    console.error('usage: compare.mjs <before.json> <after.json> [--md out.md]');
    exit(2);
  }
  const [before, after] = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const result = compare(before, after);
  const report = toMarkdown(result);
  if (md) {
    // With --md the report goes to the file; the terminal gets one summary line instead of the whole report.
    writeFileSync(md, report);
    const sum = (key) => result.towers.reduce((n, t) => n + t[key].length, 0);
    console.log(`compare: wrote ${md} (fixed ${sum('fixed')}, new ${sum('new')}, open ${sum('open')})`);
  } else {
    process.stdout.write(report);
  }
  exit(result.regression ? 1 : 0);
}

// Run the CLI only when this file is the entry point, so the tests can import compare() and toMarkdown().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
