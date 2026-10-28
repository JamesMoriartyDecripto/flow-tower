import { describe, expect, it } from 'vitest';
import { insideWorktree } from '../examples/dev-squad/src/hooks/fence.ts';

describe('insideWorktree', () => {
  it('allows paths that resolve inside the worktree', () => {
    expect(insideWorktree('/w', '/w/src/a.ts')).toBe(true);
    expect(insideWorktree('/w', '/w/src/../tests/b.ts')).toBe(true);
    expect(insideWorktree('/w', 'src/a.ts')).toBe(true);
  });

  it('denies paths that escape the worktree, including prefix look-alikes', () => {
    expect(insideWorktree('/w', '/w/../../etc/x.ts')).toBe(false);
    expect(insideWorktree('/w', '/w/../w2/x.ts')).toBe(false);
    expect(insideWorktree('/w', '/etc/passwd')).toBe(false);
    expect(insideWorktree('/w', '../x.ts')).toBe(false);
  });

  it('denies the worktree root itself', () => {
    expect(insideWorktree('/w', '/w')).toBe(false);
  });
});
