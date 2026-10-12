/**
 * `flow-tower audit <file.tower.yaml | dir>... [--json]`: per tower, the inventory, the lint findings
 * (phase 3a) and the model-fit table (phase 4). Findings are advice, so they never fail the command.
 * Exit 1 only when a tower fails to load with errors (the same rule as validate); exit 2 on usage.
 */
import { argv, exit } from 'node:process';
import { auditNesting, auditTower, inventory, type Finding, type Inventory } from '../core/audit.ts';
import { loadLibrary } from '../core/loader.ts';
import { modelFit, type ModelFit } from '../core/roles.ts';
import type { ResolvedTower, Workspace } from '../core/types.ts';

const args = argv.slice(2);
const json = args.includes('--json');
const entries = args.filter((a) => a !== '--json');
if (!entries.length) {
  console.error('usage: flow-tower audit <file.tower.yaml | dir>... [--json]');
  exit(2);
}

/** The shape of one tower in --json. Key order is part of the contract: keep it as written. */
interface TowerAudit {
  id: string;
  name: string;
  inventory: Inventory;
  findings: Finding[];
  modelFit: ModelFit[];
}

const LEVELS = ['warning', 'info'] as const;

/**
 * The audit of one tower. Only root towers (projects) get the nesting rule (AUD08): a nested tower is
 * judged through the root that contains it, so its depth is counted once, from the top.
 */
function auditOf(t: ResolvedTower, workspace: Workspace): TowerAudit {
  const root = workspace.projects.includes(t.id);
  const findings = [...auditTower(t), ...(root ? auditNesting(workspace, t.id) : [])];
  return { id: t.id, name: t.name, inventory: inventory(t), findings, modelFit: modelFit(t) };
}

/** Column-aligned table of the model fit rows, indented under the tower header. */
function printModelFit(rows: ModelFit[]) {
  if (!rows.length) {
    console.log('    no agent or model nodes');
    return;
  }
  const head = ['node', 'role', 'needs', 'model', 'categories'];
  // An empty category list is a real answer for roles like orchestrator: say how to find a model instead of a bare dash.
  const cells = rows.map((r) => [
    r.node,
    r.role,
    r.needs.join(', ') || '-',
    r.model ?? '-',
    r.categories.join(', ') || 'none (filter by modality)',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  for (const row of [head, ...cells]) {
    console.log(`    ${row.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()}`);
  }
}

function printText(t: ResolvedTower, a: TowerAudit) {
  const inv = a.inventory;
  const errors = t.issues.filter((i) => i.level === 'error');
  const counts = LEVELS.map((l) => `${a.findings.filter((f) => f.level === l).length} ${l}`).join(', ');
  const mark = errors.length ? '✗' : '✓';
  console.log(`${mark} ${a.id} — ${a.name}: ${inv.layers} layers, ${inv.nodes} nodes, ${inv.edges.total} edges (incl. ${inv.edges.links} links), ${inv.agents} agents (${counts})`);
  // Load errors come first: they explain the exit code, and the findings below may be partial because of them.
  for (const i of errors) console.log(`    error   ${i.path ? `${i.path}: ` : ''}${i.message}`);
  for (const level of LEVELS) {
    for (const f of a.findings.filter((x) => x.level === level)) {
      console.log(`    ${level.padEnd(7)} ${f.rule}${f.node ? ` ${f.node}` : ''}: ${f.message}`);
    }
  }
  console.log('    model fit:');
  printModelFit(a.modelFit);
}

const { workspace } = await loadLibrary(entries);
const towers = Object.values(workspace.towers);
const failed = towers.some((t) => t.issues.some((i) => i.level === 'error'));

if (json) {
  console.log(JSON.stringify({ towers: towers.map((t) => auditOf(t, workspace)) }, null, 2));
} else if (!towers.length) {
  console.log('no *.tower.yaml found');
} else {
  for (const t of towers) printText(t, auditOf(t, workspace));
}
exit(failed ? 1 : 0);
