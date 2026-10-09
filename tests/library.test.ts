import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTower, loadLibrary } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Issue } from '../src/core/types';

describe('runtimes, resources, status', () => {
  const def = TowerSchema.parse({
    name: 'Hybrid',
    runtimes: { laptop: { kind: 'local' }, vps: { kind: 'server', host: 'vps-1', provider: 'hetzner' } },
    agents: { worker: { model: 'sonnet', runtime: 'vps', resources: [{ kind: 'log', label: 'Worker log', path: 'logs/w.log' }] } },
    layers: [{
      id: 'l', title: 'L',
      nodes: [
        { id: 'a', agent: 'worker' },
        { id: 'b', runtime: 'laptop', status: 'planned', resources: [{ kind: 'dashboard', label: 'Grafana', url: 'https://grafana.example.com' }] },
        { id: 'c', runtime: 'mars' },
      ],
      edges: ['a -> b', 'b -> c'],
    }],
  });

  it('inherits runtime and resources from the agent, validates refs', async () => {
    const issues: Issue[] = [];
    const t = await buildTower(def, 't', { read: async () => undefined }, issues);
    const [a, b, c] = t.layers[0].nodes;
    expect(a.runtime).toMatchObject({ id: 'vps', kind: 'server', host: 'vps-1' });
    expect(a.resources).toHaveLength(1);
    expect(a.status).toBe('active');
    expect(b).toMatchObject({ status: 'planned', runtime: { id: 'laptop' } });
    expect(c.runtime).toBeUndefined();
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', message: 'unknown runtime "mars"' }));
  });

  it('rejects non-http resource urls (no javascript: links)', () => {
    const bad = { name: 'x', layers: [{ id: 'l', title: 'L', nodes: [{ id: 'n', resources: [{ kind: 'doc', label: 'x', url: 'javascript:alert(1)' }] }] }] };
    expect(TowerSchema.safeParse(bad).success).toBe(false);
  });
});

describe('loadLibrary', () => {
  it('finds towers in a directory and separates projects from nested towers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ft-'));
    mkdirSync(join(dir, 'a', 'towers'), { recursive: true });
    mkdirSync(join(dir, 'b'));
    mkdirSync(join(dir, 'node_modules'));
    const tower = (name: string, extra = '') => `name: ${name}\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: n${extra} }\n`;
    writeFileSync(join(dir, 'a', 'a.tower.yaml'), tower('A', ', tower: towers/sub.tower.yaml'));
    writeFileSync(join(dir, 'a', 'towers', 'sub.tower.yaml'), tower('Sub'));
    writeFileSync(join(dir, 'b', 'b.tower.yaml'), tower('B'));
    writeFileSync(join(dir, 'node_modules', 'x.tower.yaml'), tower('Ignored'));

    const { workspace } = await loadLibrary([dir]);
    expect(workspace.projects).toEqual(['a/a.tower.yaml', 'b/b.tower.yaml']);
    expect(Object.keys(workspace.towers).sort()).toEqual(['a/a.tower.yaml', 'a/towers/sub.tower.yaml', 'b/b.tower.yaml']);
    expect(workspace.towers['a/a.tower.yaml'].layers[0].nodes[0].tower).toBe('a/towers/sub.tower.yaml');
  });
});
