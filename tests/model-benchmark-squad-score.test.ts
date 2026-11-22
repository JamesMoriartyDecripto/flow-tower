import { describe, expect, it } from 'vitest';
import { isBlocking, scoreRun, summarize, table } from '../examples/model-benchmark/scripts/squad-score.mjs';
import type { RunLine } from '../examples/model-benchmark/scripts/squad-score.d.mts';
// The gate's rules are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { checkFinding, parseVerdict } from '../tools/squad/gate.mjs';

const SRC = 'a\nb\nconst x = 1;\nd\ne\nf\ng\nh';
const readFile = (p: string) => (p === 'src/a.ts' ? SRC : null);

const defect = {
  id: 'q-defect',
  kind: 'defect' as const,
  keys: [{ id: 'S1', file: 'src/a.ts', pattern: 'body' }],
};
const clean = { id: 'q-clean', kind: 'clean' as const, keys: [] };

const finding = (over: Record<string, unknown>) => ({
  file: 'src/a.ts:3',
  severity: 'high',
  what: 'the rule reads the body',
  why: '',
  fix: '',
  quote: 'const x = 1;',
  ...over,
});
const answer = (verdict: string, findings: unknown[]) => JSON.stringify({ verdict, findings });
const score = (kase: typeof defect | typeof clean, text: string, outcome = 'finish') =>
  scoreRun({ kase, outcome, answer: text, readFile, parseVerdict, checkFinding });

describe('scoreRun', () => {
  it('passes a defect case when a changes finding matches a key, and lists the key id', () => {
    const r = score(defect, answer('changes', [finding({})]));
    expect(r.pass).toBe(true);
    expect(r.keys).toEqual(['S1']);
    expect(r.flagged).toBe(true);
  });

  it('does not pass a finding on another file, but still counts it as flagged', () => {
    const r = score(defect, answer('changes', [finding({ file: 'src/b.ts:3' })]));
    expect(r.pass).toBe(false);
    expect(r.keys).toEqual([]);
    expect(r.flagged).toBe(true);
  });

  it('fails a defect case that is approved', () => {
    expect(score(defect, answer('approve', [])).pass).toBe(false);
  });

  it('passes a clean case approved with only a low finding', () => {
    const r = score(clean, answer('approve', [finding({ severity: 'low' })]));
    expect(r.pass).toBe(true);
    expect(r.blocking).toBe(0);
  });

  it('fails a clean case approved with a high finding', () => {
    const r = score(clean, answer('approve', [finding({ severity: 'high' })]));
    expect(r.pass).toBe(false);
    expect(r.blocking).toBe(1);
  });

  it('fails with the outcome as the failure when the run did not finish', () => {
    const r = score(defect, '', 'empty-answer');
    expect(r.pass).toBe(false);
    expect(r.failure).toBe('empty-answer');
    expect(r.verdict).toBeNull();
  });

  it('fails with no-verdict when the answer is prose', () => {
    const r = score(defect, 'I think the change is fine.');
    expect(r.pass).toBe(false);
    expect(r.failure).toBe('no-verdict');
  });

  it('counts a finding whose quote is at its line as verified, and a made-up quote as not', () => {
    const real = score(defect, answer('changes', [finding({})]));
    const made = score(defect, answer('changes', [finding({ quote: 'nothing like this is in the file' })]));
    expect(real.verified).toBe(1);
    expect(made.verified).toBe(0);
  });
});

describe('summarize and table', () => {
  const line = (over: Partial<RunLine>): RunLine => ({
    role: 'reviewer',
    model: 'A',
    kind: 'defect',
    pass: false,
    flagged: false,
    failure: null,
    keys: [],
    keysBlocking: [],
    blocking: 0,
    findings: 1,
    verified: 1,
    seconds: 10,
    cost: 0.1,
    ...over,
  });
  const lines = [
    line({ pass: true, flagged: true, seconds: 10 }),
    line({ flagged: true, seconds: 20 }),
    line({ kind: 'clean', pass: true, seconds: 30, cost: 0.2 }),
    line({ model: 'B', failure: 'empty-answer', seconds: 40, cost: 0.05 }),
    line({ model: 'B', flagged: false, seconds: null, cost: 0.05 }),
    line({ model: 'B', kind: 'clean', seconds: 50, cost: 0.05 }),
  ];

  it('groups by model with counts, the median and costPerPass null for a model with no pass', () => {
    const [a, b] = summarize(lines);
    expect(a).toMatchObject({ model: 'A', runs: 3, pass: 2, defectRuns: 2, caught: 1, flaggedDefects: 2, cleanRuns: 1, cleanPass: 1, medianSeconds: 20 });
    expect(a.cost).toBeCloseTo(0.4);
    expect(a.costPerPass).toBeCloseTo(0.2);
    expect(b).toMatchObject({ model: 'B', pass: 0, failures: { 'empty-answer': 1 } });
    expect(b.costPerPass).toBeNull();
  });

  it('renders a role heading and a counts cell like 2/3', () => {
    const out = table(summarize(lines));
    expect(out).toContain('## reviewer');
    expect(out).toContain('2/3');
    expect(out).toContain('1 empty-answer');
  });

  it('shows the key-seen, key-blocked and clean-not-blocked cells in the row of the model', () => {
    const out = table(summarize(lines.slice(0, 3)));
    const row = out.split('\n').find((l) => l.startsWith('| `A`'));
    expect(row).toContain('| 0/2 | 0/2 | 1/1 |');
  });
});

describe('isBlocking', () => {
  it('blocks on high, critical, and any severity that is not medium or low, case included', () => {
    expect(isBlocking('HIGH')).toBe(true);
    expect(isBlocking('critical')).toBe(true);
    expect(isBlocking('urgent')).toBe(true);
    expect(isBlocking('Medium')).toBe(true);
    expect(isBlocking(undefined)).toBe(true);
    expect(isBlocking('medium')).toBe(false);
    expect(isBlocking('low')).toBe(false);
  });
});

describe('keysBlocking and the severity columns', () => {
  it('keeps a key matched by a low finding out of keysBlocking', () => {
    const r = score(defect, answer('approve', [finding({ severity: 'low' })]));
    expect(r.keys).toEqual(['S1']);
    expect(r.keysBlocking).toEqual([]);
    expect(r.pass).toBe(false);
  });

  it('lists the key in keysBlocking when the matching finding is high', () => {
    expect(score(defect, answer('changes', [finding({ severity: 'high' })])).keysBlocking).toEqual(['S1']);
  });

  it('counts seen, blocked and cleanOpen per row', () => {
    const [row] = summarize([
      { role: 'reviewer', model: 'C', kind: 'defect', pass: false, flagged: true, failure: null, findings: 1, verified: 1, seconds: 1, cost: 0, keys: ['S1'], keysBlocking: [], blocking: 0 },
      { role: 'reviewer', model: 'C', kind: 'defect', pass: true, flagged: true, failure: null, findings: 1, verified: 1, seconds: 1, cost: 0, keys: ['S1'], keysBlocking: ['S1'], blocking: 1 },
      { role: 'reviewer', model: 'C', kind: 'clean', pass: true, flagged: false, failure: null, findings: 0, verified: 0, seconds: 1, cost: 0, keys: [], keysBlocking: [], blocking: 0 },
    ]);
    expect(row).toMatchObject({ seen: 2, blocked: 1, cleanOpen: 1 });
  });
});
