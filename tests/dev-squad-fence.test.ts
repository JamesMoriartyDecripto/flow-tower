import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { insideWorktree } from '../examples/dev-squad/src/hooks/fence.ts';

describe('insideWorktree', () => {
  // A real folder, so the cases exercise the same code path as production (the worktree must exist).
  const w = mkdtempSync(join(tmpdir(), 'fence-lex-'));
  mkdirSync(join(w, 'src'), { recursive: true });

  it('allows paths that resolve inside the worktree', () => {
    expect(insideWorktree(w, `${w}/src/a.ts`)).toBe(true);
    expect(insideWorktree(w, `${w}/src/../tests/b.ts`)).toBe(true);
    expect(insideWorktree(w, 'src/a.ts')).toBe(true);
  });

  it('denies paths that escape the worktree, including prefix look-alikes', () => {
    expect(insideWorktree(w, `${w}/../../etc/x.ts`)).toBe(false);
    expect(insideWorktree(w, `${w}/../${basename(w)}2/x.ts`)).toBe(false);
    expect(insideWorktree(w, '/etc/passwd')).toBe(false);
    expect(insideWorktree(w, '../x.ts')).toBe(false);
  });

  it('denies the worktree root itself', () => {
    expect(insideWorktree(w, w)).toBe(false);
  });
});

describe('insideWorktree on real folders', () => {
  const base = mkdtempSync(join(tmpdir(), 'fence-'));
  const worktree = join(base, 'wt');
  const outside = join(base, 'outside');
  mkdirSync(join(worktree, 'src'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(worktree, 'src', 'a.ts'), '');
  symlinkSync(outside, join(worktree, 'src', 'link'), 'dir');

  it('allows an existing file inside the worktree', () => {
    expect(insideWorktree(worktree, join(worktree, 'src', 'a.ts'))).toBe(true);
  });

  it('allows a new file whose folder does not exist yet', () => {
    expect(insideWorktree(worktree, join(worktree, 'src', 'new', 'b.ts'))).toBe(true);
  });

  it('denies a path that reaches outside through a symlink', () => {
    expect(insideWorktree(worktree, join(worktree, 'src', 'link', 'x.ts'))).toBe(false);
  });

  it('denies everything when the worktree does not exist', () => {
    expect(insideWorktree(join(base, 'missing'), join(base, 'missing', 'src', 'a.ts'))).toBe(false);
  });

  it('denies a dangling link whose target is outside the worktree', () => {
    symlinkSync(join(outside, 'missing.ts'), join(worktree, 'src', 'dead'));
    expect(insideWorktree(worktree, join(worktree, 'src', 'dead'))).toBe(false);
  });

  it('allows an in-tree name that merely starts with ..', () => {
    expect(insideWorktree(worktree, join(worktree, 'src', '..fixtures.ts'))).toBe(true);
  });

  it('denies the parent segment itself', () => {
    expect(insideWorktree(worktree, '..')).toBe(false);
  });
});
