import { describe, expect, it } from 'vitest';
import { cssString } from '../src/app/doc/cssString';

describe('cssString', () => {
  it('quotes plain text as a CSS string', () => {
    expect(cssString('FLOW TOWER · OVERVIEW')).toBe('"FLOW TOWER · OVERVIEW"');
  });

  it('escapes double quotes and backslashes so the string cannot end early', () => {
    expect(cssString('say "hi"')).toBe('"say \\"hi\\""');
    expect(cssString('a\\b')).toBe('"a\\\\b"');
  });

  it('writes a line break as the CSS hex escape', () => {
    expect(cssString('one\ntwo')).toBe('"one\\A two"');
  });
});
