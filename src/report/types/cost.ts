/*
 * The cost review: what a set of services spent this period, against budget and against the previous period. The
 * shape follows the reporting capability of the FinOps Framework (finops.org, "Reporting & Analytics" capability):
 * spend is shown per service with its owner, and variance is reported where a team needs to act. Every total and
 * percentage is computed here from the lines, so the report cannot drift from its source file.
 */

import { type Block, type Finding, type ReportDoc, type Severity, type Source } from '../model.ts';
import { formatMoney, formatPercent } from '../format.ts';
import { appendixSection } from './appendix.ts';
import { asObject, fail, optNumber, optString, reqArray, reqNumber, reqString, type Obj } from './input.ts';
import type { ReportType } from './index.ts';

interface CostLine {
  service: string;
  owner?: string;
  actual: number;
  budget?: number;
  previous?: number;
}

const TOP_N = 5;
/** A line that grows this much against the previous period is worth a look, even inside budget. */
const CHANGE_FLAG_PERCENT = 20;

function parseLine(raw: unknown, where: string): CostLine {
  const obj: Obj = asObject(raw, where);
  const budget = optNumber(obj, 'budget', where);
  if (budget !== undefined && budget < 0) fail(`${where}.budget`, 'must not be negative');
  const previous = optNumber(obj, 'previous', where);
  if (previous !== undefined && previous < 0) fail(`${where}.previous`, 'must not be negative');
  return {
    service: reqString(obj, 'service', where),
    owner: optString(obj, 'owner', where),
    actual: reqNumber(obj, 'actual', where),
    budget,
    previous,
  };
}

function parse(input: unknown) {
  const obj = asObject(input, 'input');
  const lines = reqArray(obj, 'lines', 'input').map((l, i) => parseLine(l, `lines[${i}]`));
  if (lines.length === 0) fail('input.lines', 'must list at least one service');
  return {
    title: reqString(obj, 'title', 'input'),
    period: reqString(obj, 'period', 'input'),
    currency: reqString(obj, 'currency', 'input'),
    lines,
  };
}

/** Change against the previous period, as a percentage with one decimal. Undefined when there is no base to compare. */
export function changePercent(line: CostLine): number | undefined {
  if (line.previous === undefined || line.previous === 0) return undefined;
  return Math.round(((line.actual - line.previous) / line.previous) * 1000) / 10;
}

/** Share of the total spend, as a percentage with one decimal. A zero total has no share, so it reads as zero. */
function sharePercent(actual: number, total: number): number {
  return total > 0 ? Math.round((actual / total) * 1000) / 10 : 0;
}

/** Overspend against budget as a percentage of the budget, or undefined when there is no budget to exceed. */
function overBudgetPercent(line: CostLine): number | undefined {
  if (line.budget === undefined || line.budget === 0 || line.actual <= line.budget) return undefined;
  return ((line.actual - line.budget) / line.budget) * 100;
}

/** Severity by how far a line strays: the larger of its overspend and its growth decides the band. */
export function varianceSeverity(sizePercent: number): Severity {
  if (sizePercent > 50) return 'high';
  if (sizePercent > 20) return 'medium';
  return 'low';
}

/**
 * Lines that need a look: over budget, or grown past the flag threshold against the previous period. The ids are
 * `C-01`, `C-02`… in the order the lines are listed: a service name holds spaces and capitals, which read badly as
 * an id and would break the anchors that link to them.
 */
function varianceFindings(lines: CostLine[], currency: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of lines) {
    const over = overBudgetPercent(line);
    const change = changePercent(line);
    const grew = change !== undefined && change > CHANGE_FLAG_PERCENT;
    if (over === undefined && !grew) continue;

    const size = Math.max(over ?? 0, grew ? (change as number) : 0);
    const parts: string[] = [];
    if (over !== undefined) {
      const excess = formatMoney(line.actual - (line.budget as number), currency);
      parts.push(`over budget by ${excess} (${formatPercent(over)})`);
    }
    if (grew) parts.push(`up ${formatPercent(change as number)} against the previous period`);
    findings.push({
      id: `C-${String(findings.length + 1).padStart(2, '0')}`,
      severity: varianceSeverity(size),
      title: line.service,
      ref: line.owner,
      detail: parts.join('; '),
    });
  }
  return findings;
}

function build(input: unknown, sources: Source[]): ReportDoc {
  const data = parse(input);
  const total = data.lines.reduce((sum, l) => sum + l.actual, 0);
  // Sorted by actual spend, then by name, so the same input always reads the same way.
  const sorted = [...data.lines].sort((a, b) => b.actual - a.actual || (a.service < b.service ? -1 : a.service > b.service ? 1 : 0));
  const top = sorted.slice(0, TOP_N);
  const overBudget = data.lines.filter((l) => overBudgetPercent(l) !== undefined).length;

  const summary: Block[] = [
    {
      kind: 'facts',
      rows: [
        ['Period', data.period],
        ['Total actual', formatMoney(total, data.currency)],
        ['Services', data.lines.length],
        ['Over budget', overBudget],
      ],
    },
    {
      kind: 'bars',
      caption: `Top ${top.length} services by actual spend`,
      unit: data.currency,
      items: top.map((l) => ({ label: l.service, value: l.actual, shown: formatMoney(l.actual, data.currency) })),
    },
  ];

  const byService: Block[] = [{
    kind: 'table',
    columns: ['Service', 'Owner', 'Actual', 'Budget', 'Previous', 'Change', 'Share'],
    rows: sorted.map((l) => {
      const change = changePercent(l);
      return [
        l.service,
        l.owner ?? 'unassigned',
        formatMoney(l.actual),
        l.budget === undefined ? 'n/a' : formatMoney(l.budget),
        l.previous === undefined ? 'n/a' : formatMoney(l.previous),
        change === undefined ? 'n/a' : formatPercent(change),
        formatPercent(sharePercent(l.actual, total)),
      ];
    }),
  }];

  const findings = varianceFindings(data.lines, data.currency);
  const variance: Block[] = findings.length
    ? [{ kind: 'findings', items: findings }]
    : [{ kind: 'text', text: 'No service is over budget or has grown past the flag threshold.', origin: 'data' }];

  return {
    type: COST_REVIEW.id,
    typeTitle: COST_REVIEW.title,
    title: data.title,
    subtitle: data.period,
    classification: 'internal',
    sources,
    sections: [
      { id: 'summary', title: 'Summary', blocks: summary },
      { id: 'by-service', title: 'By service', blocks: byService },
      { id: 'variance', title: 'Variance', blocks: variance },
      appendixSection(sources),
    ],
  };
}

export const COST_REVIEW: ReportType = {
  id: 'cost-review',
  title: 'Cost review',
  required: ['summary', 'by-service', 'variance', 'appendix-sources'],
  sample: 'examples/cost-review/input.yaml',
  build,
};
