import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInside } from '../src/guard.mjs';

const root = '/srv/files';

test('resolves a legitimate file under root', () => {
  assert.equal(resolveInside(root, 'docs/a.txt'), '/srv/files/docs/a.txt');
});

test('rejects a sibling folder that shares the root prefix', () => {
  assert.throws(() => resolveInside(root, '../files-private/key.pem'), /escapes/);
});

test('rejects normalized ../ escapes', () => {
  assert.throws(() => resolveInside(root, '../../etc/passwd'), /escapes/);
  assert.throws(() => resolveInside(root, 'docs/../../secret.txt'), /escapes/);
});

test('rejects absolute paths outside root', () => {
  assert.throws(() => resolveInside(root, '/etc/passwd'), /escapes/);
});
