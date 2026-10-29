// Offline check for the coder task case A: exit 0 only when the module behaves as specified.
import assert from 'node:assert/strict';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const { formatPrice } = await import(pathToFileURL(argv[2]).href);
assert.equal(formatPrice(12.5), '12.50');
assert.equal(formatPrice(0), '0.00');
assert.equal(formatPrice(3.14159), '3.14');
assert.throws(() => formatPrice(NaN), TypeError);
assert.throws(() => formatPrice(Infinity), TypeError);
assert.throws(() => formatPrice('12.5'), TypeError);
