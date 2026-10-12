import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compare, toMarkdown } from '../examples/tower-optimizer/scripts/compare.mjs';
import type { Snapshot } from '../examples/tower-optimizer/scripts/compare.d.mts';

const snapshotScript = join(import.meta.dirname, '..', 'examples', 'tower-optimizer', 'scripts', 'snapshot.mjs');

const inventory = (nodes: number, budget = 0) => ({
  layers: 1,
  nodes,
  nodesByType: {},
  edges: { total: 1, links: 0, byKind: {} },
  agents: 1,
  models: {},
  runtimes: { declared: 0, byKind: {} },
  withOps: { budget, limits: 0, approval: 0, evals: 0, sandbox: 0, fanout: 0 },
  nestedTowers: [],
  run: { budget: false, limits: false },
});

const before: Snapshot = {
  towers: [
    {
      id: 'shop',
      name: 'Shop',
      inventory: inventory(3),
      findings: [
        { rule: 'AUD01', level: 'warning', node: 'flow.pay', message: 'no budget' },
        { rule: 'AUD02', level: 'info', node: 'flow.log', message: 'no sandbox' },
      ],
      modelFit: [{ node: 'flow.pay', role: 'general', model: 'small', categories: [], needs: [], prefer: '' }],
    },
  ],
};

const after: Snapshot = {
  towers: [
    {
      id: 'shop',
      name: 'Shop',
      inventory: inventory(4, 1),
      findings: [
        { rule: 'AUD02', level: 'info', node: 'flow.log', message: 'no sandbox (still)' },
        { rule: 'AUD03', level: 'warning', node: 'flow.ship', message: 'loop without limit' },
      ],
      modelFit: [{ node: 'flow.pay', role: 'coder', model: 'large', categories: [], needs: [], prefer: '' }],
    },
  ],
};

describe('tower-optimizer compare', () => {
  const result = compare(before, after);
  const [shop] = result.towers;

  it('matches towers by id and reports the fixed, new and open findings on rule+node', () => {
    expect(shop.id).toBe('shop');
    expect(shop.fixed.map((f) => f.rule)).toEqual(['AUD01']);
    expect(shop.new.map((f) => f.rule)).toEqual(['AUD03']);
    expect(shop.open.map((f) => f.rule)).toEqual(['AUD02']);
  });

  it('reports inventory deltas for the counters', () => {
    const nodes = shop.inventory.find((r) => r.name === 'nodes');
    const budget = shop.inventory.find((r) => r.name === 'withOps.budget');
    expect(nodes).toMatchObject({ before: 3, after: 4, delta: 1 });
    expect(budget).toMatchObject({ before: 0, after: 1, delta: 1 });
  });

  it('reports the model change per node, with role and model before and after', () => {
    expect(shop.models).toEqual([
      {
        node: 'flow.pay',
        role: { before: 'general', after: 'coder' },
        model: { before: 'small', after: 'large' },
      },
    ]);
  });

  it('flags a regression only when a new finding is at level warning', () => {
    expect(result.regression).toBe(true);

    const infoOnly: Snapshot = {
      towers: [{ ...after.towers[0], findings: [{ rule: 'AUD09', level: 'info', node: 'flow.x', message: 'hint' }] }],
    };
    expect(compare(before, infoOnly).regression).toBe(false);
    expect(compare(before, before).regression).toBe(false);
  });

  it('snapshot records the path as given and creates a missing output folder', () => {
    // A stub audit binary keeps the test independent of a real tower; FLOW_TOWER_BIN selects it.
    const dir = mkdtempSync(join(tmpdir(), 'snapshot-'));
    const stub = join(dir, 'flow-tower');
    writeFileSync(stub, '#!/bin/sh\necho \'{"towers":[]}\'\n');
    chmodSync(stub, 0o755);
    const out = join(dir, 'reports', 'nested', 'x.json');
    execFileSync(process.execPath, [snapshotScript, 'my-tower', out], {
      env: { ...process.env, FLOW_TOWER_BIN: stub },
      cwd: dir,
    });
    const saved = JSON.parse(readFileSync(out, 'utf8'));
    expect(saved.path).toBe('my-tower');
    expect(readFileSync(out, 'utf8')).not.toContain(dir);
  });

  it('renders the markdown headings for each section', () => {
    const md = toMarkdown(result);
    for (const heading of ['# Tower optimizer', '## shop — Shop', '### Findings fixed', '### Findings new', '### Findings still open', '### Inventory', '### Model changes']) {
      expect(md).toContain(heading);
    }
    expect(md).toContain('**Regression:**');
  });
});
