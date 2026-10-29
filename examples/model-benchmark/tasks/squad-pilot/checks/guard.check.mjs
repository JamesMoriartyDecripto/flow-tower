// Offline check for the coder task case B: exit 0 only when the module behaves as specified.
import assert from 'node:assert/strict';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const { resolveInside } = await import(pathToFileURL(argv[2]).href);
const root = '/srv/files';
assert.equal(resolveInside(root, 'docs/a.txt'), '/srv/files/docs/a.txt');
assert.throws(() => resolveInside(root, '../files-private/key.pem'), /escapes/);
assert.throws(() => resolveInside(root, '../../etc/passwd'), /escapes/);
assert.throws(() => resolveInside(root, '/etc/passwd'), /escapes/);
