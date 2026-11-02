import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isMainModule } from '../src/cli/main-module.ts';

describe('isMainModule', () => {
  const entry = '/home/me/My Projects/x.ts';
  const metaUrl = pathToFileURL(entry).href;

  it('is true for an entry path with spaces', () => {
    expect(metaUrl).toContain('%20');
    expect(isMainModule(metaUrl, entry)).toBe(true);
  });

  it('is false for a different entry', () => {
    expect(isMainModule(metaUrl, '/home/me/other.ts')).toBe(false);
  });

  it('is false when there is no entry', () => {
    expect(isMainModule(metaUrl, undefined)).toBe(false);
  });
});
