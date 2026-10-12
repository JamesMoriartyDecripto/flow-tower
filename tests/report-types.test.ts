import { describe, expect, it } from 'vitest';
import { checkReport, failed } from '../src/report/checks.ts';
import { renderReport } from '../src/report/html.ts';
import type { Source } from '../src/report/model.ts';
import { getType, REPORT_TYPES } from '../src/report/types/index.ts';
import { changePercent, money, varianceSeverity } from '../src/report/types/cost.ts';
import { duration } from '../src/report/types/postmortem.ts';
import { cvssSeverity } from '../src/report/types/security.ts';
import { variancePercent } from '../src/report/types/status.ts';

const SOURCES: Source[] = [{ id: 'S1', label: 'Input file', path: 'input.yaml', sha256: 'abcdef0123456789' }];

const SECURITY_INPUT = {
  title: 'Q3 web assessment',
  client: 'Acme',
  scope: ['app.acme.test'],
  methodology: ['OWASP ASVS 4.0'],
  window: '2024-07 to 2024-08',
  findings: [
    { id: 'F-2', title: 'Weak TLS', cvss: 5.3, asset: 'lb-1', description: 'TLS 1.0 enabled', recommendation: 'Disable TLS 1.0' },
    { id: 'F-1', title: 'SQL injection', cvss: 9.8, asset: 'api', description: 'Unsafe query', recommendation: 'Parameterise', status: 'fixed' },
    { id: 'F-3', title: 'Banner', severity: 'info', asset: 'web', description: 'Version shown', recommendation: 'Hide banner' },
  ],
};

const STATUS_INPUT = {
  project: 'Tower',
  period: '2024-W30',
  overall: 'amber',
  milestones: [
    { name: 'Beta', due: '2024-08-01', done: true, rag: 'green' },
    { name: 'GA', due: '2024-09-01', rag: 'red' },
  ],
  risks: [{ id: 'R-1', title: 'Vendor delay', impact: 'high', owner: 'ops', mitigation: 'Second vendor' }],
  decisions: ['Ship without SSO'],
  budget: { planned: 1000, actual: 1100, currency: 'EUR' },
};

const POSTMORTEM_INPUT = {
  title: 'API outage',
  severity: 'SEV-2',
  started: '2024-08-01T10:00:00Z',
  detected: '2024-08-01T10:30:00Z',
  mitigated: '2024-08-01T12:00:00Z',
  resolved: '2024-08-01T14:15:00Z',
  impact: ['Checkout errors for 2h'],
  timeline: [
    { at: '2024-08-01T10:00:00Z', event: 'Deploy 1.4.2' },
    { at: '2024-08-01T10:30:00Z', event: 'Pager fires' },
  ],
  causes: ['Missing index on orders.user_id'],
  trigger: 'Deploy 1.4.2',
  actions: [
    { id: 'A-1', action: 'Add index check to CI', owner: 'api', due: '2024-08-15', kind: 'prevent', status: 'open' },
    { id: 'A-2', action: 'Alert on p99 latency', owner: 'sre', due: '2024-08-20', kind: 'detect', status: 'done' },
  ],
  lessons: { well: ['Rollback was quick'], badly: ['Alert was late'], lucky: [] },
};

const COST_INPUT = {
  title: 'July cloud cost',
  period: '2024-07',
  currency: 'EUR',
  lines: [
    { service: 'db', owner: 'data', actual: 600, budget: 500, previous: 400 },
    { service: 'web', owner: 'front', actual: 300, budget: 400, previous: 290 },
    { service: 'cache', actual: 100, previous: 40 },
  ],
};

describe('report types', () => {
  it('registers both types with unique ids', () => {
    const ids = REPORT_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getType('security-assessment').id).toBe('security-assessment');
    expect(() => getType('nope')).toThrow(/unknown report type "nope"/);
  });

  it.each([
    ['security-assessment', SECURITY_INPUT],
    ['project-status', STATUS_INPUT],
    ['postmortem', POSTMORTEM_INPUT],
    ['cost-review', COST_INPUT],
  ])('%s builds a document that passes every blocking check', (id, input) => {
    const type = getType(id);
    const doc = type.build(input, SOURCES);
    const html = renderReport(doc);
    const results = checkReport(doc, html, { sections: type.required });
    expect(failed(results)).toEqual([]);
  });

  it('security summary counts severities and the findings are sorted by severity then id', () => {
    const doc = getType('security-assessment').build(SECURITY_INPUT, SOURCES);
    const findings = doc.sections.find((s) => s.id === 'findings')!.blocks[0];
    expect(findings.kind === 'findings' && findings.items.map((f) => f.id)).toEqual(['F-1', 'F-2', 'F-3']);
    const bars = doc.sections.find((s) => s.id === 'summary')!.blocks[0];
    expect(bars.kind === 'bars' && bars.items.find((i) => i.label === 'critical')?.value).toBe(1);
  });

  it('bands CVSS at the edges of the FIRST v4.0 scale', () => {
    expect(cvssSeverity(0)).toBe('info');
    expect(cvssSeverity(0.1)).toBe('low');
    expect(cvssSeverity(3.9)).toBe('low');
    expect(cvssSeverity(4.0)).toBe('medium');
    expect(cvssSeverity(6.9)).toBe('medium');
    expect(cvssSeverity(7.0)).toBe('high');
    expect(cvssSeverity(8.9)).toBe('high');
    expect(cvssSeverity(9.0)).toBe('critical');
    expect(cvssSeverity(10)).toBe('critical');
    expect(() => cvssSeverity(10.1)).toThrow(/between 0 and 10/);
  });

  it('throws naming the finding when a severity disagrees with its CVSS band', () => {
    const bad = {
      ...SECURITY_INPUT,
      findings: [{ id: 'F-9', title: 'X', cvss: 9.0, severity: 'low', asset: 'a', description: 'd', recommendation: 'r' }],
    };
    expect(() => getType('security-assessment').build(bad, SOURCES)).toThrow(/F-9.*disagrees with CVSS 9 \(critical\)/);
  });

  it('computes budget variance as a percentage of the plan', () => {
    expect(variancePercent({ planned: 1000, actual: 1100, currency: 'EUR' })).toBe(10);
    expect(variancePercent({ planned: 800, actual: 600, currency: 'EUR' })).toBe(-25);
    const doc = getType('project-status').build(STATUS_INPUT, SOURCES);
    const budget = doc.sections.find((s) => s.id === 'budget')!.blocks;
    expect(budget).toContainEqual({ kind: 'facts', rows: [['Variance', '10%']] });
  });

  it('names the field in an invalid status input', () => {
    const bad = { ...STATUS_INPUT, overall: 'purple' };
    expect(() => getType('project-status').build(bad, SOURCES)).toThrow(/input\.overall: must be one of red, amber, green/);
    const noBase = { ...STATUS_INPUT, budget: { planned: 0, actual: 5, currency: 'EUR' } };
    expect(() => getType('project-status').build(noBase, SOURCES)).toThrow(/budget\.planned/);
  });

  it('computes postmortem durations from the timestamps as h m', () => {
    expect(duration('2024-08-01T10:00:00Z', '2024-08-01T10:30:00Z')).toBe('0h 30m');
    expect(duration('2024-08-01T10:00:00Z', '2024-08-01T14:15:00Z')).toBe('4h 15m');
    const doc = getType('postmortem').build(POSTMORTEM_INPUT, SOURCES);
    const summary = doc.sections.find((s) => s.id === 'summary')!.blocks[0];
    expect(summary).toEqual({
      kind: 'facts',
      rows: [
        ['Severity', 'SEV-2'],
        ['Started', '2024-08-01T10:00:00Z'],
        ['Time to detect', '0h 30m'],
        ['Time to mitigate', '1h 30m'],
        ['Time to resolve', '4h 15m'],
      ],
    });
  });

  it('rejects postmortem timestamps out of order, naming the field', () => {
    const bad = { ...POSTMORTEM_INPUT, mitigated: '2024-08-01T09:00:00Z' };
    expect(() => getType('postmortem').build(bad, SOURCES)).toThrow(/input\.mitigated: is earlier than detected/);
    const badTimeline = {
      ...POSTMORTEM_INPUT,
      timeline: [{ at: '2024-08-01T11:00:00Z', event: 'a' }, { at: '2024-08-01T10:00:00Z', event: 'b' }],
    };
    expect(() => getType('postmortem').build(badTimeline, SOURCES)).toThrow(/timeline\[1\]\.at/);
  });

  it('computes cost change, share and variance severity', () => {
    expect(money(1234.5)).toBe('1234.50');
    expect(changePercent({ service: 's', actual: 150, previous: 100 })).toBe(50);
    expect(changePercent({ service: 's', actual: 150 })).toBeUndefined();
    expect(varianceSeverity(60)).toBe('high');
    expect(varianceSeverity(30)).toBe('medium');
    expect(varianceSeverity(10)).toBe('low');
  });

  it('lists over-budget and fast-growing lines as variance findings, sorted by actual', () => {
    const doc = getType('cost-review').build(COST_INPUT, SOURCES);
    const summary = doc.sections.find((s) => s.id === 'summary')!.blocks;
    expect(summary[0]).toEqual({
      kind: 'facts',
      rows: [
        ['Period', '2024-07'],
        ['Total actual', '1000.00 EUR'],
        ['Services', 3],
        ['Over budget', 1],
      ],
    });
    const byService = doc.sections.find((s) => s.id === 'by-service')!.blocks[0];
    expect(byService.kind === 'table' && byService.rows.map((r) => r[0])).toEqual(['db', 'web', 'cache']);
    const variance = doc.sections.find((s) => s.id === 'variance')!.blocks[0];
    expect(variance.kind === 'findings' && variance.items.map((f) => [f.id, f.severity])).toEqual([
      ['var-db', 'medium'],
      ['var-cache', 'high'],
    ]);
  });
});
