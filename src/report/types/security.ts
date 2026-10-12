/*
 * The security assessment report: a list of findings with CVSS scores, built into a ReportDoc. The severity comes
 * from the CVSS score when one is given, so two people reading the same file get the same band. A severity that
 * disagrees with the score is an input error, not a silent pick, because one of the two is wrong.
 */

import { SEVERITIES, type Block, type Finding, type ReportDoc, type Severity, type Source } from '../model.ts';
import { appendixSection } from './appendix.ts';
import {
  asObject, fail, optNumber, optString, optStringList, oneOf, reqArray, reqString, type Obj,
} from './input.ts';
import type { ReportType } from './index.ts';

/**
 * CVSS v4.0 qualitative severity ratings, from the FIRST specification (section 6, "Qualitative Severity
 * Rating Scale"): None 0.0, Low 0.1-3.9, Medium 4.0-6.9, High 7.0-8.9, Critical 9.0-10.0. The scale has a
 * "none" band; the report model has no such level, so it maps to "info".
 */
export function cvssSeverity(score: number): Severity {
  if (score < 0 || score > 10) fail('cvss', `must be between 0 and 10, got ${score}`);
  if (score === 0) return 'info';
  if (score < 4) return 'low';
  if (score < 7) return 'medium';
  if (score < 9) return 'high';
  return 'critical';
}

interface RawFinding {
  id: string;
  title: string;
  cvss?: number;
  severity?: Severity;
  asset: string;
  description: string;
  recommendation: string;
  status?: string;
}

function parseFinding(raw: unknown, where: string): RawFinding {
  const obj: Obj = asObject(raw, where);
  const id = reqString(obj, 'id', where);
  const at = `${where} (${id})`;
  const cvss = optNumber(obj, 'cvss', at);
  const severity = obj.severity === undefined
    ? undefined
    : oneOf(obj.severity, SEVERITIES, `${at}.severity`);
  if (cvss === undefined && severity === undefined) fail(at, 'needs a cvss score or a severity');
  if (cvss !== undefined && severity !== undefined) {
    // Checked here so the error names the finding: the author must fix one of the two values.
    const band = cvssSeverity(cvss);
    if (band !== severity) {
      fail(at, `severity "${severity}" disagrees with CVSS ${cvss} (${band})`);
    }
  }
  return {
    id,
    title: reqString(obj, 'title', at),
    cvss,
    severity,
    asset: reqString(obj, 'asset', at),
    description: reqString(obj, 'description', at),
    recommendation: reqString(obj, 'recommendation', at),
    status: optString(obj, 'status', at),
  };
}

function severityOf(raw: RawFinding): Severity {
  return raw.cvss !== undefined ? cvssSeverity(raw.cvss) : (raw.severity as Severity);
}

/** Highest severity first, then by id, so the same findings always come out in the same order. */
function compareFindings(a: Finding, b: Finding): number {
  const rank = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  if (rank !== 0) return rank;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function parse(input: unknown) {
  const obj = asObject(input, 'input');
  const findings = reqArray(obj, 'findings', 'input').map((f, i) => parseFinding(f, `findings[${i}]`));
  return {
    title: reqString(obj, 'title', 'input'),
    client: optString(obj, 'client', 'input'),
    scope: optStringList(obj, 'scope', 'input'),
    methodology: optStringList(obj, 'methodology', 'input'),
    window: optString(obj, 'window', 'input'),
    findings,
  };
}

function build(input: unknown, sources: Source[]): ReportDoc {
  const data = parse(input);
  const items: Finding[] = data.findings
    .map((f) => ({
      id: f.id,
      severity: severityOf(f),
      title: f.title,
      ref: f.asset,
      detail: f.description,
      recommendation: f.recommendation,
      status: f.status,
    }))
    .sort(compareFindings);

  const counts: Block = {
    kind: 'bars',
    caption: 'Findings by severity',
    unit: 'findings',
    items: SEVERITIES.map((s) => ({ label: s, value: items.filter((f) => f.severity === s).length, tone: s })),
  };
  const facts: Block = {
    kind: 'facts',
    rows: [
      ['Findings', items.length],
      ['Client', data.client ?? 'not stated'],
      ['Window', data.window ?? 'not stated'],
    ],
  };

  return {
    type: SECURITY_ASSESSMENT.id,
    typeTitle: SECURITY_ASSESSMENT.title,
    title: data.title,
    subtitle: data.window,
    audience: data.client,
    classification: 'confidential',
    sources,
    sections: [
      { id: 'summary', title: 'Summary', blocks: [counts, facts] },
      { id: 'scope', title: 'Scope', blocks: [{ kind: 'list', items: data.scope }] },
      { id: 'methodology', title: 'Methodology', blocks: [{ kind: 'list', items: data.methodology }] },
      { id: 'findings', title: 'Findings', blocks: [{ kind: 'findings', items }] },
      {
        id: 'remediation',
        title: 'Remediation',
        blocks: [{
          kind: 'table',
          columns: ['Id', 'Severity', 'Asset', 'Status'],
          rows: items.map((f) => [f.id, f.severity, f.ref ?? '', f.status ?? 'open']),
        }],
      },
      appendixSection(sources),
    ],
  };
}

export const SECURITY_ASSESSMENT: ReportType = {
  id: 'security-assessment',
  title: 'Security assessment',
  required: ['summary', 'scope', 'methodology', 'findings', 'remediation', 'appendix-sources'],
  sample: 'examples/security-assessment/input.yaml',
  build,
};
