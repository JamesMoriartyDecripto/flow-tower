/*
 * The report document model: plain data, no behaviour beyond two tiny helpers. The engine reads only this
 * shape, so a generator (tower, library, or any source) builds a ReportDoc and hands it to renderReport.
 * Facts come from deterministic code; a model may draft prose only as a `draft` text block with citations.
 */

export type Classification = 'public' | 'internal' | 'confidential';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Rag = 'red' | 'amber' | 'green';

/** Highest severity first: the order of the findings summary table. */
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export interface Source {
  id: string;
  label: string;
  path?: string;
  url?: string;
  sha256?: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  ref?: string;
  detail: string;
  recommendation?: string;
  status?: string;
  cites?: string[];
}

export interface BarItem {
  label: string;
  value: number;
  tone?: string;
}

export interface StatusItem {
  label: string;
  rag: Rag;
  note?: string;
}

export type Block =
  | { kind: 'text'; text: string; origin: 'data' | 'draft'; cites?: string[] }
  | { kind: 'facts'; rows: [string, string | number][] }
  | { kind: 'table'; columns: string[]; rows: (string | number)[][]; caption?: string }
  | { kind: 'findings'; items: Finding[] }
  | { kind: 'bars'; caption: string; unit?: string; items: BarItem[] }
  | { kind: 'status'; items: StatusItem[] }
  | { kind: 'list'; items: string[]; ordered?: boolean };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
  sections?: Section[];
}

export interface ReportDoc {
  type: string;
  /** The type's human title for the cover and control, e.g. "Security assessment"; `type` is the id slug. */
  typeTitle?: string;
  title: string;
  subtitle?: string;
  audience?: string;
  classification: Classification;
  brand?: string;
  /** Extra label/value facts shown on the cover, after the audience and classification. */
  coverFacts?: [string, string][];
  sources: Source[];
  sections: Section[];
}

/** The first 12 characters of a sha256: enough to tell files apart on paper, short enough to read. */
export function shortHash(sha256: string | undefined): string {
  return sha256 ? sha256.slice(0, 12) : '';
}
