import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without declarations
import { fixTask, judgePrompt, numberFindings, parseJudgement } from '../tools/squad/runner-judge.mjs';

const review = {
  verdict: 'changes',
  findings: [
    { file: 'src/a.ts:42', quote: 'const x = 1;', what: 'x is unused.', why: 'dead code', fix: 'remove it', severity: 'low' },
    { file: 'src/b.ts:7', quote: 'return y;', what: 'y may be undefined.', why: 'crash', fix: 'guard it' },
  ],
};
const security = {
  verdict: 'changes',
  findings: [{ file: 'src/a.ts:42', quote: 'eval(input)', what: 'eval on input.', why: 'injection', fix: 'drop eval', severity: 'high' }],
};

describe('numberFindings', () => {
  it('numbers reviewer findings R1, R2 then security S1', () => {
    const ids = numberFindings(review, security).map((f: any) => [f.id, f.role]);
    expect(ids).toEqual([['R1', 'reviewer'], ['R2', 'reviewer'], ['S1', 'security']]);
  });

  it('accepts a missing side', () => {
    expect(numberFindings(null, security).map((f: any) => f.id)).toEqual(['S1']);
    expect(numberFindings(null, null)).toEqual([]);
  });
});

describe('judgePrompt', () => {
  it('contains every id and the keep/drop rule', () => {
    const findings = numberFindings(review, security);
    const prompt = judgePrompt(findings, 'Brief text');
    for (const id of ['R1', 'R2', 'S1']) expect(prompt).toContain(`**${id}**`);
    expect(prompt).toContain('Brief text');
    expect(prompt).toContain('keep: a real defect this pull request introduces');
    expect(prompt).toContain('drop: wrong, harmless, already handled');
  });
});

describe('parseJudgement', () => {
  const ids = ['R1', 'R2', 'S1'];
  const full = {
    R1: { decision: 'keep', reason: 'real' },
    R2: { decision: 'drop', reason: 'harmless' },
    S1: { decision: 'keep', reason: 'reachable' },
  };

  it('accepts a complete answer in a json fence', () => {
    const text = `Here it is.\n\`\`\`json\n${JSON.stringify(full)}\n\`\`\``;
    expect(parseJudgement(text, ids)).toEqual({
      ok: true,
      keep: ['R1', 'S1'],
      drop: [{ id: 'R2', reason: 'harmless' }],
    });
  });

  it('ignores ids the answer adds', () => {
    const r = parseJudgement(JSON.stringify({ ...full, X9: { decision: 'keep', reason: 'extra' } }), ids);
    expect(r.ok).toBe(true);
    expect(r.keep).toEqual(['R1', 'S1']);
  });

  it('rejects a missing id', () => {
    const { S1: _omit, ...part } = full;
    expect(parseJudgement(JSON.stringify(part), ids).ok).toBe(false);
  });

  it('rejects a decision maybe', () => {
    const r = parseJudgement(JSON.stringify({ ...full, R1: { decision: 'maybe', reason: 'unsure' } }), ids);
    expect(r.ok).toBe(false);
  });

  it('rejects an empty reason', () => {
    const r = parseJudgement(JSON.stringify({ ...full, R1: { decision: 'keep', reason: '  ' } }), ids);
    expect(r.ok).toBe(false);
  });

  it('rejects non-JSON without throwing', () => {
    expect(parseJudgement('I keep them all.', ids).ok).toBe(false);
    expect(parseJudgement(undefined, ids).ok).toBe(false);
  });
});

describe('fixTask', () => {
  const kept = numberFindings(review, security).filter((f: any) => f.id !== 'R2');

  it('names the task after the plan steps for round 1', () => {
    const task = fixTask(kept, { issue: '320', round: 1 });
    expect(task.name).toBe('91-review-fixes.md');
    expect(task.text.startsWith('# 320-91: fix the kept review findings (round 1)')).toBe(true);
  });

  it('drops a file outside the repository from the Files line', () => {
    const outside = [
      { id: 'R1', file: '../x', what: 'a', fix: 'b' },
      { id: 'R2', file: '/etc/y', what: 'c', fix: 'd' },
      { id: 'R3', file: 'src/ok.ts:5', what: 'e', fix: 'f' },
    ];
    const task = fixTask(outside, { issue: '320', round: 1 });
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/ok.ts');
    expect(task.text).not.toContain('/etc/y');
  });

  it('returns null when every file is outside the repository', () => {
    const outside = [
      { id: 'R1', file: '../x', what: 'a', fix: 'b' },
      { id: 'R2', file: '/etc/y', what: 'c', fix: 'd' },
    ];
    expect(fixTask(outside, { issue: '320', round: 1 })).toBeNull();
  });

  it('strips the line suffix and lists each file once', () => {
    const task = fixTask(kept, { issue: '320', round: 1 });
    expect(task.text).toContain('Files: src/a.ts\n');
    // The line stays in the numbered items (the fixer needs it), but the Files line names the file alone.
    expect(task.text).toContain('2. src/a.ts:42: eval on input. Fix: drop eval');
    expect(task.text.match(/^Files: .*$/m)?.[0]).toBe('Files: src/a.ts');
    expect(task.text).toContain('Verify: `run check`');
  });
});
