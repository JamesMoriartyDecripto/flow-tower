import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';

/** Loads one tower written from `body` and returns its issues as "level path: message". */
async function issuesOf(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
  writeFileSync(join(dir, 't.tower.yaml'), `name: T\nlayers:\n  - id: l\n    title: L\n${body}`);
  const { workspace } = await loadLibrary([dir]);
  return workspace.towers['t.tower.yaml'].issues.map((i) => `${i.level} ${i.path ?? ''}: ${i.message}`);
}

describe('validate messages point at the fix (#56)', () => {
  it('names the missing field of a union, not "Invalid input"', async () => {
    const issues = await issuesOf('    nodes:\n      - { id: a, fanout: { by: query } }\n');
    expect(issues).toEqual(['error l.a.fanout.max: required field missing (expected number)']);
  });

  it('hints at quoting when a comma cut a value into a bogus key', async () => {
    const [issue] = await issuesOf('    nodes:\n      - { id: a, description: Newton, in SI units. }\n');
    expect(issue).toContain('Unrecognized key: "in SI units."');
    expect(issue).toContain('quote the value');
  });

  it('hints at quoting on an unquoted ": " in a block value', async () => {
    const [issue] = await issuesOf('    description: Gate: blocks the PR\n    nodes: []\n');
    expect(issue).toContain('line 5');
    expect(issue).toContain('quote the value');
  });

  it('warns about labels the node card cuts', async () => {
    const issues = await issuesOf([
      '    nodes:',
      '      - { id: a, label: Eighteen chars ok }',
      '      - { id: b, label: Nineteen characters }',
      '      - { id: c, label: Thirteen char, tower: c.tower.yaml }',
      '      - { id: d, label: Fourteen chars, tower: d.tower.yaml }',
      '    edges: [a -> b, b -> c, c -> d]',
      '',
    ].join('\n'));
    const labels = issues.filter((i) => i.includes('label'));
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatch(/^warning l\.b: label "Nineteen characters" has 19 characters, the card shows 18/);
    expect(labels[1]).toMatch(/^warning l\.d: .*shows 13 \(the nested-tower badge/);
  });
});

describe('schema error paths', () => {
  it('use layer and node ids, not indexes', async () => {
    const issues = await issuesOf('    nodes:\n      - { id: gate, approval: { by: lead, note: x } }\n  - id: second\n    title: S\n    nodes: [{ id: b, colour: red }]\n    edges: [{ form: a }]\n');
    expect(issues).toEqual([
      'error l.gate.approval: Unrecognized key: "note"',
      'error second.b: Unrecognized key: "colour"',
      'error layers.second.edges.0.from: required field missing (expected string)',
      'error layers.second.edges.0.to: required field missing (expected string)',
      'error layers.second.edges.0: Unrecognized key: "form"',
    ]);
  });
});
