import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insideLibrary } from '../src/server/files.ts';

describe('insideLibrary (hub file scope)', () => {
  it('is true for the library itself and a folder under it', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ft-scope-'));
    try {
      const lib = join(base, 'lib');
      await mkdir(join(lib, 'tower'), { recursive: true });
      expect(await insideLibrary(lib, lib)).toBe(true);
      expect(await insideLibrary(join(lib, 'tower'), lib)).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('is false for a sibling whose name starts with the library name', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ft-scope-'));
    try {
      const lib = join(base, 'lib');
      const other = join(base, 'lib-other');
      await mkdir(lib);
      await mkdir(other);
      expect(await insideLibrary(other, lib)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('is false for a symlink inside the library that points outside', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ft-scope-'));
    try {
      const lib = join(base, 'lib');
      const outside = join(base, 'outside');
      await mkdir(lib);
      await mkdir(outside);
      const link = join(lib, 'escape');
      await symlink(outside, link, 'dir');
      expect(await insideLibrary(link, lib)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('is false when there is no library', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ft-scope-'));
    try {
      expect(await insideLibrary(base, undefined)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('is false for a missing root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ft-scope-'));
    try {
      expect(await insideLibrary(join(base, 'missing'), base)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
