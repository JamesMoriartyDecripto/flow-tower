import { describe, expect, it } from 'vitest';
import { watchIgnored } from '../src/server/watch-filter.ts';

const file = { isDirectory: () => false };
const dir = { isDirectory: () => true };

describe('watchIgnored', () => {
  const ignored = watchIgnored(['/lib'], (p) => p === '/lib/a/prompt.md');

  it('ignores nothing outside the entry folders', () => {
    expect(ignored('/elsewhere/x.txt', file)).toBe(false);
    expect(ignored('/libx/y.csv', file)).toBe(false);
  });

  it('ignores node_modules and hidden segments, with or without stats', () => {
    expect(ignored('/lib/a/.venv/x.py')).toBe(true);
    expect(ignored('/lib/node_modules/x')).toBe(true);
    expect(ignored('/lib/a/.hidden', file)).toBe(true);
    expect(watchIgnored(['/lib'], () => true)('/lib/a/.hidden', file)).toBe(true);
  });

  it('keeps folders and tower files', () => {
    expect(ignored('/lib/a', dir)).toBe(false);
    expect(ignored('/lib/a/b.tower.yaml', file)).toBe(false);
  });

  it('ignores other files unless they are referenced', () => {
    expect(ignored('/lib/a/data.csv', file)).toBe(true);
    expect(ignored('/lib/a/prompt.md', file)).toBe(false);
  });
});
