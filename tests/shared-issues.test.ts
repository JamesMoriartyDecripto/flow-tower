import { describe, expect, it } from 'vitest';
import { relaxSharedIssues } from '../src/server/shared-towers.ts';
import type { Issue } from '../src/core/types.ts';

describe('relaxSharedIssues', () => {
  it('turns a not-found error into info naming the machine', () => {
    const issues: Issue[] = [{ level: 'error', message: 'prompt file not found: p.md', path: 'prompts.a', code: 'missing-file' }];
    const out = relaxSharedIssues(issues, 'box-1');
    expect(out).toEqual([{
      level: 'info',
      message: 'prompt file not found: p.md (shared YAML only: the file stays on box-1)',
      path: 'prompts.a',
      code: 'missing-file',
    }]);
  });

  it('relaxes the outside-project and secret-file errors too', () => {
    const out = relaxSharedIssues([
      { level: 'error', message: '../x.md is outside the project (demo): not read', code: 'outside-project' },
      { level: 'error', message: '.env is a secret file or in the user folder: not read', code: 'secret-file' },
    ], 'box-1');
    expect(out.map((i) => i.level)).toEqual(['info', 'info']);
    expect(out.every((i) => i.message.endsWith('(shared YAML only: the file stays on box-1)'))).toBe(true);
  });

  it('keeps a duplicate-id error as an error', () => {
    const issues: Issue[] = [{ level: 'error', message: 'duplicate node id "n1"', path: 'layers.0.nodes.1' }];
    expect(relaxSharedIssues(issues, 'box-1')).toEqual(issues);
  });

  it('relaxes a missing-file warning too, and leaves other warnings and info untouched', () => {
    const issues: Issue[] = [
      { level: 'warning', message: 'file not found: x.md', code: 'missing-file' },
      { level: 'warning', message: 'loop without a limit' },
      { level: 'info', message: 'node has no connections' },
    ];
    expect(relaxSharedIssues(issues, 'box-1')).toEqual([
      { level: 'info', message: 'file not found: x.md (shared YAML only: the file stays on box-1)', code: 'missing-file' },
      issues[1],
      issues[2],
    ]);
  });

  it('relaxes only the issues that carry a file code (#190)', () => {
    const coded: Issue[] = [{ level: 'warning', message: 'file not found: x.md', code: 'missing-file' }];
    const plain: Issue[] = [{ level: 'error', message: 'file not found: a node named like a file' }];
    expect(relaxSharedIssues(coded, 'box-1')[0].level).toBe('info');
    expect(relaxSharedIssues(plain, 'box-1')).toEqual(plain);
  });

  it('does not mutate the input issues', () => {
    const issues: Issue[] = [{ level: 'error', message: 'tower file not found: a.yaml' }];
    const before = JSON.stringify(issues);
    const out = relaxSharedIssues(issues, 'box-1');
    expect(JSON.stringify(issues)).toBe(before);
    expect(out).not.toBe(issues);
  });
});
