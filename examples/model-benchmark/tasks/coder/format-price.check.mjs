// Deterministic check for format-price.md: exit 0 when every case passes.
import assert from 'node:assert/strict';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const { formatPrice } = await import(pathToFileURL(argv[2]).href);
const cases = [
  [null, '-'], [undefined, '-'], ['', '-'], ['-1', 'var'], ['0', '$0.00'],
  ['0.0000003', '$0.30'], ['0.0000025', '$2.50'], ['0.00000004', '$0.04'], ['0.000015', '$15.00'], [0.0000001, '$0.10'],
];
for (const [input, want] of cases) assert.equal(formatPrice(input), want, `formatPrice(${JSON.stringify(input)})`);
