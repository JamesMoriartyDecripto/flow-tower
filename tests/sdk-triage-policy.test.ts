import { describe, expect, it, vi } from 'vitest';

// The host has no @anthropic-ai/claude-agent-sdk, so it is mocked BEFORE triage.ts loads.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));

// Local types: the example module is never statically imported, so its types stay out of the host typecheck.
type Issue = { repo: string; number: number; title: string; body: string; labels: string[] };
type Triage = { kind: string; complexity: number; route: 'full' | 'needs_info' | 'reject'; risk: 'low' | 'high'; areas: string[]; questions: string[]; rationale: string };

const triagePath = '../examples/dev-squad/src/triage.ts';
const { applyPolicy } = (await import(triagePath)) as { applyPolicy: (t: Triage, issue: Issue) => Triage };

const base: Triage = { kind: 'bug', complexity: 1, route: 'full', risk: 'low', areas: ['web'], questions: [], rationale: 'r' };
const issue: Issue = { repo: 'a/b', number: 1, title: 'Fix typo', body: 'It says teh.', labels: [] };

describe('applyPolicy: sensitive areas force a human sign-off', () => {
  it('leaves a plain issue unchanged', () => {
    expect(applyPolicy(base, issue)).toEqual(base);
  });

  it('matches the issue body even when the title and areas are clean', () => {
    const t = applyPolicy(base, { ...issue, body: 'Adjust the auth token check' });
    expect(t.risk).toBe('high');
    expect(t.rationale).toContain('[policy: sensitive area, risk high]');
  });

  it('matches the title', () => {
    expect(applyPolicy(base, { ...issue, title: 'Billing page copy' }).risk).toBe('high');
  });

  it('matches model-chosen areas', () => {
    expect(applyPolicy({ ...base, areas: ['payments'] }, issue).risk).toBe('high');
  });

  it('the squad:skip label rejects even a sensitive issue', () => {
    const t = applyPolicy(base, { ...issue, body: 'auth token', labels: ['squad:skip'] });
    expect(t.route).toBe('reject');
  });

  it('a needs_info route is not upgraded', () => {
    const triage: Triage = { ...base, route: 'needs_info' };
    expect(applyPolicy(triage, { ...issue, body: 'auth token' })).toEqual(triage);
  });
});
