import { describe, expect, it } from 'vitest';
// The gate's rules are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { checkFinding, parseVerdict, readiness } from '../tools/squad/gate.mjs';

const SRC = 'a\nb\nconst x = 1;\nd\ne\nf\ng\nh';
const readA = (p: string) => (p === 'src/a.ts' ? SRC : null);

const green = {
  checks: [{ name: 'build', bucket: 'pass' }, { name: 'docs', bucket: 'skipping' }],
  pr: { mergeable: 'MERGEABLE', isDraft: false, headRefOid: 'abc' },
  localHead: 'abc',
  lastCommitAt: 1000,
  verdicts: [
    { role: 'reviewer', verdict: 'approve', findings: [], at: 2000 },
    { role: 'security', verdict: 'approve', findings: [], at: 2000 },
  ],
};

// A copy of the green facts with one change, to test one reason at a time.
const with_ = (patch: Record<string, unknown>) => ({ ...green, ...patch });

describe('parseVerdict', () => {
  it('reads the JSON between the header and the footer', () => {
    const text = 'mode: oneshot\n{"verdict":"approve","findings":[]}\n\n--- model · 1 step';
    expect(parseVerdict(text)).toEqual({ verdict: 'approve', findings: [] });
  });

  it('reads JSON inside a json fence', () => {
    const text = 'mode: oneshot\n```json\n{"verdict":"changes","findings":[{"file":"src/a.ts:3"}]}\n```\n--- m';
    expect(parseVerdict(text).verdict).toBe('changes');
    expect(parseVerdict(text).findings).toHaveLength(1);
  });

  it('throws when there is no JSON', () => {
    expect(() => parseVerdict('no answer')).toThrow('no JSON verdict found');
  });

  it('throws when the verdict is not approve or changes', () => {
    expect(() => parseVerdict('{"verdict":"ok"}')).toThrow('verdict must be approve or changes');
  });
});

describe('checkFinding', () => {
  it('verifies a quote on its line', () => {
    expect(checkFinding({ file: 'src/a.ts:3', quote: 'const x = 1;' }, readA).status).toBe('verified');
  });

  it('verifies a quote within 3 lines of the cited one', () => {
    expect(checkFinding({ file: 'src/a.ts:5', quote: 'const x = 1;' }, readA).status).toBe('verified');
  });

  it('rejects a quote more than 3 lines away', () => {
    expect(checkFinding({ file: 'src/a.ts:8', quote: 'const x = 1;' }, readA)).toMatchObject({
      status: 'unverified',
      reason: 'quote not at that line',
    });
  });

  it('ignores extra spaces in the quote', () => {
    expect(checkFinding({ file: 'src/a.ts:3', quote: 'const   x = 1;' }, readA).status).toBe('verified');
  });

  it('reports a missing quote', () => {
    expect(checkFinding({ file: 'src/a.ts:3' }, readA).reason).toBe('no quote');
  });

  it('reports a file that readFile does not give', () => {
    expect(checkFinding({ file: 'src/b.ts:3', quote: 'x' }, readA).reason).toBe('file not found');
  });

  it('reports a file:line with no line number', () => {
    expect(checkFinding({ file: 'src/a.ts', quote: 'x' }, readA).reason).toBe('bad file:line');
  });
});

describe('readiness', () => {
  it('a green PR is ready with no reasons', () => {
    expect(readiness(green)).toEqual({ ready: true, reasons: [] });
  });

  it('a failing check is a reason', () => {
    const r = readiness(with_({ checks: [{ name: 'build', bucket: 'fail' }] }));
    expect(r.ready).toBe(false);
    expect(r.reasons).toEqual(['CI build: fail']);
  });

  it('no checks is a reason', () => {
    expect(readiness(with_({ checks: [] })).reasons).toEqual(['no CI checks reported']);
  });

  it('a draft is a reason', () => {
    expect(readiness(with_({ pr: { ...green.pr, isDraft: true } })).reasons)
      .toEqual(['the pull request is a draft']);
  });

  it('CONFLICTING is a reason', () => {
    expect(readiness(with_({ pr: { ...green.pr, mergeable: 'CONFLICTING' } })).reasons)
      .toEqual(['not mergeable: CONFLICTING']);
  });

  it('a different local head is a reason', () => {
    expect(readiness(with_({ localHead: 'def' })).reasons)
      .toEqual(['the worktree is not at the pull request head']);
  });

  it('a missing security verdict is a reason', () => {
    expect(readiness(with_({ verdicts: [green.verdicts[0]] })).reasons)
      .toEqual(['security: no verdict']);
  });

  it('a changes verdict is a reason', () => {
    const verdicts = [{ ...green.verdicts[0], verdict: 'changes' }, green.verdicts[1]];
    expect(readiness(with_({ verdicts })).reasons).toEqual(['reviewer: changes requested']);
  });

  it('a verdict older than the last commit is a reason', () => {
    const verdicts = [{ ...green.verdicts[0], at: 500 }, green.verdicts[1]];
    expect(readiness(with_({ verdicts })).reasons)
      .toEqual(['reviewer: older than the last commit, run it again']);
  });

  it('a verified high finding is a reason', () => {
    const finding = { file: 'src/a.ts:3', severity: 'high', status: 'verified' };
    const verdicts = [green.verdicts[0], { ...green.verdicts[1], findings: [finding] }];
    expect(readiness(with_({ verdicts })).reasons).toEqual(['security: high finding at src/a.ts:3']);
  });

  it('an unverified critical finding does not block', () => {
    const finding = { file: 'src/a.ts:3', severity: 'critical', status: 'unverified', reason: 'no quote' };
    const verdicts = [green.verdicts[0], { ...green.verdicts[1], findings: [finding] }];
    expect(readiness(with_({ verdicts }))).toEqual({ ready: true, reasons: [] });
  });
});
