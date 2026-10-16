// Deterministic check for shell-path.md: exit 0 when every case passes. Expected values follow bin/cli-name.js.
import assert from 'node:assert/strict';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const { shellQuote, shellPath } = await import(pathToFileURL(argv[2]).href);
const q = [
  ['it\'s', "'it'\\''s'"], ['', "''"], ["a'b'c", "'a'\\''b'\\''c'"], ["'", "''\\'''"], ['$HOME', "'$HOME'"],
];
for (const [input, want] of q) assert.equal(shellQuote(input), want, `shellQuote(${JSON.stringify(input)})`);
const p = [
  ['/home/ana/flow-tower/bin/flow-tower.js', '/home/ana/flow-tower/bin/flow-tower.js'],
  ['C:/Users/ana/repo,v2/x_y@1%+=.js', 'C:/Users/ana/repo,v2/x_y@1%+=.js'],
  ['-rf', '-rf'],
  ['/Users/Ana Rossi/flow tower', "'/Users/Ana Rossi/flow tower'"],
  ['/tmp/$x', "'/tmp/$x'"],
  ['/tmp/"q"', `'/tmp/"q"'`],
  ['/tmp/`id`', "'/tmp/`id`'"],
  ['/tmp/a\nb', "'/tmp/a\nb'"],
  ["/home/o'brien/repo", "'/home/o'\\''brien/repo'"],
  ['/home/josé/repo', "'/home/josé/repo'"],
  ['', "''"],
];
for (const [input, want] of p) assert.equal(shellPath(input), want, `shellPath(${JSON.stringify(input)})`);
