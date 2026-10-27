import { describe, expect, it } from 'vitest';
// The steward's helpers are plain ESM with no types, so they are imported as untyped modules here.
// @ts-expect-error plain .mjs without declarations
import { attemptModels, changedFiles, costOf, linkedIssue, outputDir, parseArgs, passOutcome, summaryRow, verdictSummary } from '../tools/squad/prs.mjs';

describe('parseArgs', () => {
  it('reads a list of PR numbers and flags', () => {
    expect(parseArgs(['--pr', '12,34', '--force'])).toMatchObject({ prs: [12, 34], force: true });
  });

  it('refuses a PR list with anything but digits', () => {
    expect(parseArgs(['--pr', '12;rm'])).toBeNull();
  });

  it('refuses an unknown flag', () => {
    expect(parseArgs(['--bogus'])).toBeNull();
  });

  it('gives prs null when --pr is absent', () => {
    expect(parseArgs([])).toMatchObject({ prs: null, force: false, keep: false, dryRun: false });
  });
});

describe('linkedIssue', () => {
  it('finds the first closing keyword link', () => {
    expect(linkedIssue('Closes #315; see #7')).toBe(315);
  });

  it('gives null when no keyword links an issue', () => {
    expect(linkedIssue('Fixes: nothing')).toBeNull();
  });
});

describe('passOutcome', () => {
  it('is ok for exit code 0', () => {
    expect(passOutcome(0, '')).toBe('ok');
  });

  it('is empty for an empty answer', () => {
    expect(passOutcome(1, 'empty answer')).toBe('empty');
  });

  it('is truncated for a cut answer', () => {
    expect(passOutcome(1, 'truncated answer (finish_reason: length)')).toBe('truncated');
  });

  it('is error for anything else', () => {
    expect(passOutcome(1, 'boom')).toBe('error');
  });
});

describe('attemptModels', () => {
  it('tries the security model twice, then the reviewer model', () => {
    expect(attemptModels('security', { reviewer: 'r', security: 's' })).toEqual(['s', 's', 'r']);
  });

  it('tries the reviewer model twice', () => {
    expect(attemptModels('reviewer', { reviewer: 'r', security: 's' })).toEqual(['r', 'r']);
  });
});

describe('costOf', () => {
  it('sums every footer amount', () => {
    expect(costOf('--- m · 1 step · $0.0120 · x\n--- m · 1 step · $0.0030 · y')).toBeCloseTo(0.015);
  });

  it('is 0 when there is no amount', () => {
    expect(costOf('no footer')).toBe(0);
  });
});

describe('changedFiles', () => {
  it('lists every touched path and only the paths that still exist', () => {
    const r = changedFiles('M\ta.ts\nD\tb.ts\nR100\tc.ts\td.ts\nA\te.ts');
    expect(r.paths).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']);
    expect(r.files).toEqual(['a.ts', 'd.ts', 'e.ts']);
  });
});

describe('outputDir', () => {
  it('names the folder by PR and the first 12 characters of the head', () => {
    expect(outputDir('/t', 7, 'abcdef0123456789')).toMatch(/pr-7-abcdef012345$/);
  });
});

describe('summaryRow', () => {
  it('writes one Markdown row with a short head and a 4-decimal cost', () => {
    expect(summaryRow({ pr: 3, head: 'abcdef0123', review: 'approve', security: 'approve', gate: 'READY', cost: 0.5 }))
      .toBe('| #3 | abcdef0 | approve | approve | READY | $0.5000 |');
  });
});

describe('verdictSummary', () => {
  it('counts the findings by severity', () => {
    expect(verdictSummary('{"verdict":"changes","findings":[{"severity":"high"},{"severity":"low"},{"severity":"low"}]}'))
      .toBe('changes: 1 high, 2 low');
  });

  it('gives the verdict alone when there are no findings', () => {
    expect(verdictSummary('{"verdict":"approve","findings":[]}')).toBe('approve');
  });

  it('gives no verdict for a text without JSON', () => {
    expect(verdictSummary('empty answer')).toBe('no verdict');
  });
});
