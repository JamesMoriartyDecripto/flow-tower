/*
 * The project status report: where a project stands this period, its milestones, risks, decisions and budget.
 * Every number here is computed from the input (counts, variance), never typed in by hand, so the report agrees
 * with the file it came from.
 */

import { type Block, type Finding, type Rag, type ReportDoc, type Source } from '../model.ts';
import { formatMoney, formatPercent } from '../format.ts';
import { appendixSection } from './appendix.ts';
import {
  asObject, fail, optBoolean, optStringList, oneOf, reqArray, reqNumber, reqString, type Obj,
} from './input.ts';
import type { ReportType } from './index.ts';

const RAGS = ['red', 'amber', 'green'] as const;
const IMPACTS = ['high', 'medium', 'low'] as const;

interface Milestone {
  name: string;
  due: string;
  done: boolean;
  rag: Rag;
}

interface Risk {
  id: string;
  title: string;
  impact: (typeof IMPACTS)[number];
  owner: string;
  mitigation: string;
}

interface Budget {
  planned: number;
  actual: number;
  currency: string;
}

function parseMilestone(raw: unknown, where: string): Milestone {
  const obj: Obj = asObject(raw, where);
  return {
    name: reqString(obj, 'name', where),
    due: reqString(obj, 'due', where),
    done: optBoolean(obj, 'done', where) ?? false,
    rag: oneOf(obj.rag, RAGS, `${where}.rag`),
  };
}

function parseRisk(raw: unknown, where: string): Risk {
  const obj: Obj = asObject(raw, where);
  return {
    id: reqString(obj, 'id', where),
    title: reqString(obj, 'title', where),
    impact: oneOf(obj.impact, IMPACTS, `${where}.impact`),
    owner: reqString(obj, 'owner', where),
    mitigation: reqString(obj, 'mitigation', where),
  };
}

function parseBudget(raw: unknown): Budget {
  const obj = asObject(raw, 'budget');
  const planned = reqNumber(obj, 'planned', 'budget');
  if (planned <= 0) fail('budget.planned', 'must be above zero, or the variance has no base');
  return {
    planned,
    actual: reqNumber(obj, 'actual', 'budget'),
    currency: reqString(obj, 'currency', 'budget'),
  };
}

/** Variance as a percentage of the plan, one decimal place. Positive means over budget. */
export function variancePercent(budget: Budget): number {
  return Math.round(((budget.actual - budget.planned) / budget.planned) * 1000) / 10;
}

function parse(input: unknown) {
  const obj = asObject(input, 'input');
  const overall = oneOf(obj.overall, RAGS, 'input.overall');
  const milestones = reqArray(obj, 'milestones', 'input')
    .map((m, i) => parseMilestone(m, `milestones[${i}]`));
  const risks = reqArray(obj, 'risks', 'input').map((r, i) => parseRisk(r, `risks[${i}]`));
  return {
    project: reqString(obj, 'project', 'input'),
    period: reqString(obj, 'period', 'input'),
    overall,
    milestones,
    risks,
    decisions: optStringList(obj, 'decisions', 'input'),
    budget: obj.budget === undefined ? undefined : parseBudget(obj.budget),
  };
}

/** A risk reads as a finding card: impact is its severity, the owner is named, the mitigation is the detail. */
function riskCard(r: Risk): Finding {
  return {
    id: r.id,
    severity: r.impact,
    title: r.title,
    ref: r.owner,
    detail: r.mitigation,
  };
}

function build(input: unknown, sources: Source[]): ReportDoc {
  const data = parse(input);
  const done = data.milestones.filter((m) => m.done).length;
  const countRag = (rag: Rag) => data.milestones.filter((m) => m.rag === rag).length;

  // Overall is a fact like the others, so its RAG chip sits in the same table as the counts.
  const summary: Block[] = [
    {
      kind: 'facts',
      rows: [
        ['Overall', data.overall],
        ['Milestones', data.milestones.length],
        ['Done', done],
        ['Red milestones', countRag('red')],
        ['Open risks', data.risks.length],
        ['High-impact risks', data.risks.filter((r) => r.impact === 'high').length],
      ],
    },
  ];

  // One table only: the RAG column carries the chip, so a separate status list would repeat every row.
  const milestones: Block[] = [
    {
      kind: 'table',
      columns: ['Milestone', 'Due', 'Done', 'RAG'],
      rows: data.milestones.map((m) => [m.name, m.due, m.done ? 'yes' : 'no', m.rag]),
    },
  ];

  const risks: Block[] = data.risks.length
    ? [{ kind: 'findings', items: data.risks.map(riskCard) }]
    : [{ kind: 'text', text: 'No risks are open this period.', origin: 'data' }];

  const decisions: Block[] = data.decisions.length
    ? [{ kind: 'list', items: data.decisions }]
    : [{ kind: 'text', text: 'No decisions were recorded this period.', origin: 'data' }];

  const budget: Block[] = data.budget
    ? [
        {
          kind: 'bars',
          caption: 'Planned against actual spend',
          unit: data.budget.currency,
          items: [
            { label: 'Planned', value: data.budget.planned, shown: formatMoney(data.budget.planned, data.budget.currency) },
            { label: 'Actual', value: data.budget.actual, shown: formatMoney(data.budget.actual, data.budget.currency) },
          ],
        },
        { kind: 'facts', rows: [['Variance', formatPercent(variancePercent(data.budget))]] },
      ]
    : [{ kind: 'text', text: 'No budget was stated for this period.', origin: 'data' }];

  return {
    type: PROJECT_STATUS.id,
    typeTitle: PROJECT_STATUS.title,
    title: `${data.project}: project status`,
    subtitle: data.period,
    classification: 'internal',
    sources,
    sections: [
      { id: 'summary', title: 'Summary', blocks: summary },
      { id: 'milestones', title: 'Milestones', blocks: milestones },
      { id: 'risks', title: 'Risks', blocks: risks },
      { id: 'decisions', title: 'Decisions', blocks: decisions },
      { id: 'budget', title: 'Budget', blocks: budget },
      appendixSection(sources),
    ],
  };
}

export const PROJECT_STATUS: ReportType = {
  id: 'project-status',
  title: 'Project status',
  required: ['summary', 'milestones', 'risks', 'decisions', 'budget', 'appendix-sources'],
  sample: 'examples/project-status/input.yaml',
  build,
};
