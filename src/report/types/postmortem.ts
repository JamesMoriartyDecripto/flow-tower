/*
 * The incident postmortem: what happened, how long detection, mitigation and resolution took, why it happened, and
 * which actions follow. The structure follows the blameless postmortem chapter of the Google SRE book
 * ("Postmortem Culture: Learning from Failure", Site Reliability Engineering, 2016). The durations are computed from
 * the timestamps, never typed in, so the report and the timeline cannot disagree.
 */

import { type Block, type ReportDoc, type Section, type Source } from '../model.ts';
import { appendixSection } from './appendix.ts';
import {
  asObject, fail, optString, optStringList, oneOf, reqArray, reqString, type Obj,
} from './input.ts';
import type { ReportType } from './index.ts';

const KINDS = ['prevent', 'mitigate', 'detect', 'process'] as const;
type ActionKind = (typeof KINDS)[number];

interface TimelineEntry {
  at: string;
  event: string;
}

interface Action {
  id: string;
  action: string;
  owner: string;
  due: string;
  kind: ActionKind;
  status: string;
}

interface Lessons {
  well: string[];
  badly: string[];
  lucky: string[];
}

/** Parse an ISO timestamp to milliseconds. A string that is not a date is an input error, not a NaN duration. */
function isoTime(value: string, where: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) fail(where, `must be an ISO date-time, got "${value}"`);
  return ms;
}

function parseTimeline(raw: unknown[]): TimelineEntry[] {
  const entries = raw.map((e, i) => {
    const where = `timeline[${i}]`;
    const obj: Obj = asObject(e, where);
    const at = reqString(obj, 'at', where);
    isoTime(at, `${where}.at`);
    return { at, event: reqString(obj, 'event', where) };
  });
  // The timeline is read top to bottom as a story, so out-of-order entries are an error, not a sort.
  for (let i = 1; i < entries.length; i++) {
    if (isoTime(entries[i].at, `timeline[${i}].at`) < isoTime(entries[i - 1].at, `timeline[${i - 1}].at`)) {
      fail(`timeline[${i}].at`, 'is earlier than the entry before it');
    }
  }
  return entries;
}

function parseAction(raw: unknown, where: string): Action {
  const obj: Obj = asObject(raw, where);
  return {
    id: reqString(obj, 'id', where),
    action: reqString(obj, 'action', where),
    owner: reqString(obj, 'owner', where),
    due: reqString(obj, 'due', where),
    kind: oneOf(obj.kind, KINDS, `${where}.kind`),
    status: reqString(obj, 'status', where),
  };
}

function parseLessons(raw: unknown): Lessons | undefined {
  if (raw === undefined) return undefined;
  const obj = asObject(raw, 'lessons');
  return {
    well: optStringList(obj, 'well', 'lessons'),
    badly: optStringList(obj, 'badly', 'lessons'),
    lucky: optStringList(obj, 'lucky', 'lessons'),
  };
}

function parse(input: unknown) {
  const obj = asObject(input, 'input');
  const severity = reqString(obj, 'severity', 'input');
  const started = reqString(obj, 'started', 'input');
  const detected = reqString(obj, 'detected', 'input');
  const mitigated = reqString(obj, 'mitigated', 'input');
  const resolved = reqString(obj, 'resolved', 'input');
  const times = { started, detected, mitigated, resolved };
  // Each key moment must come after the one before it; a postmortem with detection before the incident is wrong.
  const order = ['started', 'detected', 'mitigated', 'resolved'] as const;
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1];
    const cur = order[i];
    if (isoTime(times[cur], `input.${cur}`) < isoTime(times[prev], `input.${prev}`)) {
      fail(`input.${cur}`, `is earlier than ${prev}`);
    }
  }
  return {
    title: reqString(obj, 'title', 'input'),
    severity,
    ...times,
    impact: optStringList(obj, 'impact', 'input'),
    timeline: parseTimeline(reqArray(obj, 'timeline', 'input')),
    causes: optStringList(obj, 'causes', 'input'),
    trigger: optString(obj, 'trigger', 'input'),
    actions: reqArray(obj, 'actions', 'input').map((a, i) => parseAction(a, `actions[${i}]`)),
    lessons: parseLessons(obj.lessons),
  };
}

/** A duration as `h m`, rounded to the minute. The inputs are already checked to be in order, so it is never negative. */
export function duration(fromIso: string, toIso: string): string {
  const minutes = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function build(input: unknown, sources: Source[]): ReportDoc {
  const data = parse(input);

  const summary: Block[] = [{
    kind: 'facts',
    rows: [
      ['Severity', data.severity],
      ['Started', data.started],
      ['Time to detect', duration(data.started, data.detected)],
      ['Time to mitigate', duration(data.detected, data.mitigated)],
      ['Time to resolve', duration(data.started, data.resolved)],
    ],
  }];

  const impact: Block[] = data.impact.length
    ? [{ kind: 'list', items: data.impact }]
    : [{ kind: 'text', text: 'No customer impact was stated.', origin: 'data' }];

  const timeline: Block[] = data.timeline.length
    ? [{
        kind: 'table',
        columns: ['Time', 'Event'],
        rows: data.timeline.map((e) => [e.at, e.event]),
      }]
    : [{ kind: 'text', text: 'No timeline entries were recorded.', origin: 'data' }];

  const causes: Block[] = [
    ...(data.trigger ? [{ kind: 'facts' as const, rows: [['Trigger', data.trigger] as [string, string]] }] : []),
    ...(data.causes.length
      ? [{ kind: 'list' as const, items: data.causes }]
      : [{ kind: 'text' as const, text: 'No root causes were identified.', origin: 'data' as const }]),
  ];

  // Counts per kind, so the reader sees whether the fixes prevent recurrence or only speed up detection.
  const counts: Block = {
    kind: 'bars',
    caption: 'Actions by kind',
    unit: 'actions',
    items: KINDS.map((k) => ({ label: k, value: data.actions.filter((a) => a.kind === k).length })),
  };
  const actions: Block[] = data.actions.length
    ? [
        {
          kind: 'table',
          columns: ['Id', 'Action', 'Kind', 'Owner', 'Due', 'Status'],
          rows: data.actions.map((a) => [a.id, a.action, a.kind, a.owner, a.due, a.status]),
        },
        counts,
      ]
    : [{ kind: 'text', text: 'No follow-up actions were recorded.', origin: 'data' }];

  const lessonSection = (title: string, items: string[]): Section => ({
    id: title.toLowerCase(),
    title,
    blocks: items.length
      ? [{ kind: 'list', items }]
      : [{ kind: 'text', text: `Nothing recorded under "${title.toLowerCase()}".`, origin: 'data' }],
  });
  const lessons: Section = {
    id: 'lessons',
    title: 'Lessons',
    blocks: data.lessons ? [] : [{ kind: 'text', text: 'No lessons were recorded.', origin: 'data' }],
    sections: data.lessons
      ? [
          lessonSection('Well', data.lessons.well),
          lessonSection('Badly', data.lessons.badly),
          lessonSection('Lucky', data.lessons.lucky),
        ]
      : undefined,
  };

  return {
    type: POSTMORTEM.id,
    typeTitle: POSTMORTEM.title,
    title: data.title,
    subtitle: `${data.severity}, started ${data.started}`,
    classification: 'confidential',
    sources,
    sections: [
      { id: 'summary', title: 'Summary', blocks: summary },
      { id: 'impact', title: 'Impact', blocks: impact },
      { id: 'timeline', title: 'Timeline', blocks: timeline },
      { id: 'root-causes', title: 'Root causes', blocks: causes },
      { id: 'actions', title: 'Actions', blocks: actions },
      lessons,
      appendixSection(sources),
    ],
  };
}

export const POSTMORTEM: ReportType = {
  id: 'postmortem',
  title: 'Incident postmortem',
  required: ['summary', 'impact', 'timeline', 'root-causes', 'actions', 'lessons', 'appendix-sources'],
  sample: 'examples/postmortem/input.yaml',
  build,
};
