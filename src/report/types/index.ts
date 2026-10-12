/*
 * The report types: each one is a plug-in with an id, the sections its document must have, a sample input, and a
 * builder. The builder is pure and deterministic (the same input gives the same ReportDoc), so the blocking checks
 * in checks.ts can judge the result the same way every time. A type never renders html; the engine does that.
 */

import type { ReportDoc, Source } from '../model.ts';
import { COST_REVIEW } from './cost.ts';
import { POSTMORTEM } from './postmortem.ts';
import { PROJECT_STATUS } from './status.ts';
import { SECURITY_ASSESSMENT } from './security.ts';

export interface ReportType {
  id: string;
  title: string;
  /** Section ids the built document must contain; checkReport fails the report when one is missing. */
  required: string[];
  /** Path (from the repo root) of an example input, so a user can see the expected shape. */
  sample: string;
  /**
   * A type that renders in the app (3D snapshots) is not a ReportDoc builder: `export` hands it to
   * `flow-tower export` (src/cli/export.ts), which owns its checks. Such a type has no `build`.
   */
  delegate?: 'export';
  build?(input: unknown, sources: Source[]): ReportDoc;
}

/** The tower PDF of #65: rendered in the app, so the report CLI delegates to `flow-tower export`. */
export const TOWER_DOCUMENTATION: ReportType = {
  id: 'tower-documentation',
  title: 'Tower documentation',
  required: [],
  sample: 'examples/dev-squad/dev-squad.tower.yaml',
  delegate: 'export',
};

export const REPORT_TYPES: readonly ReportType[] = [
  SECURITY_ASSESSMENT,
  PROJECT_STATUS,
  POSTMORTEM,
  COST_REVIEW,
  TOWER_DOCUMENTATION,
];

/** The report type with this id. An unknown id is an error, since a caller cannot build a report without one. */
export function getType(id: string): ReportType {
  const found = REPORT_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`unknown report type "${id}"; known: ${REPORT_TYPES.map((t) => t.id).join(', ')}`);
  return found;
}
