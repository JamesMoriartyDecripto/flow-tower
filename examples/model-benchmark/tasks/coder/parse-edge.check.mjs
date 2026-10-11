// Deterministic check for parse-edge.md: exit 0 when every case passes.
import assert from 'node:assert/strict';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const { parseEdge } = await import(pathToFileURL(argv[2]).href);
const same = (text, want) => {
  const got = parseEdge(text);
  assert.equal(typeof got, 'object', `${text}: expected an object, got ${JSON.stringify(got)}`);
  assert.deepEqual({ ...got, label: got.label ?? undefined }, { ...want, label: want.label ?? undefined }, text);
};
same('a -> b', { from: 'a', to: 'b', kind: 'flow' });
same('a -> b: label', { from: 'a', to: 'b', kind: 'flow', label: 'label' });
same('a -> b [spawn]', { from: 'a', to: 'b', kind: 'spawn' });
same('a -> b [spawn]: label', { from: 'a', to: 'b', kind: 'spawn', label: 'label' });
same('intake.handle -> tools.kb [data]: search', { from: 'intake.handle', to: 'tools.kb', kind: 'data', label: 'search' });
same('a -> b: x: y', { from: 'a', to: 'b', kind: 'flow', label: 'x: y' });
same('  lead-1   ->  worker_2 [ call ] :  max 3  ', { from: 'lead-1', to: 'worker_2', kind: 'call', label: 'max 3' });
const bad = parseEdge('a -> b [jump]');
assert.ok(typeof bad === 'string' && bad.includes('jump'), 'unknown kind must return a string naming it');
assert.equal(typeof parseEdge('a b'), 'string', 'malformed edge must return a string');
