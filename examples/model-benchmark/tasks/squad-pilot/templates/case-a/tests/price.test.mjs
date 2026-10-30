import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../src/price.mjs';

test('formats finite numbers with toFixed(2)', () => {
  assert.equal(formatPrice(12.5), '12.50');
  assert.equal(formatPrice(0), '0.00');
  assert.equal(formatPrice(3.14159), '3.14');
  assert.equal(formatPrice(-0), (-0).toFixed(2));
});

test('rejects NaN and Infinity with a TypeError', () => {
  assert.throws(() => formatPrice(NaN), TypeError);
  assert.throws(() => formatPrice(Infinity), TypeError);
  assert.throws(() => formatPrice(-Infinity), TypeError);
});

test('rejects strings with a TypeError', () => {
  assert.throws(() => formatPrice('12.5'), TypeError);
  assert.throws(() => formatPrice(''), TypeError);
});
