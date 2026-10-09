import { describe, expect, it } from 'vitest';
import { buildTower } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Issue } from '../src/core/types';
import { evalPasses, opsMarks } from '../src/app/ops';

const fs = { read: async () => undefined };

describe('operational fields', () => {
  const def = TowerSchema.parse({
    name: 'Ops',
    agents: {
      worker: { name: 'Worker', budget: { usd: 5, on_exceed: 'pause' }, fanout: { min: 3, max: 5, by: 'query complexity' }, data: { sensitivity: 'pii', region: 'eu' } },
    },
    layers: [{
      id: 'l',
      title: 'L',
      nodes: [
        { id: 'alert', type: 'entry', trigger: { kind: 'webhook', source: 'PagerDuty' } },
        { id: 'w', agent: 'worker', budget: { usd: 2 }, evals: [{ name: 'pass@1', value: 0.82, target: 0.8 }] },
        { id: 'ok', type: 'human', approval: { by: 'on-call', timeout: '15m', on_timeout: 'escalate' }, sla: '72h' },
      ],
      edges: ['alert -> w', { from: 'w', to: 'ok', kind: 'call', protocol: 'a2a' }],
    }],
  });

  it('inherits from the agent, node fields win', async () => {
    const issues: Issue[] = [];
    const t = await buildTower(def, 't', fs, issues);
    const [alert, w, ok] = t.layers[0].nodes;
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(alert.ops.trigger).toEqual({ kind: 'webhook', source: 'PagerDuty' });
    expect(w.ops.budget).toEqual({ usd: 2 }); // node replaces the agent budget
    expect(w.ops.fanout).toEqual({ min: 3, max: 5, by: 'query complexity' });
    expect(w.ops.data?.sensitivity).toBe('pii');
    expect(ok.ops).toMatchObject({ sla: '72h', approval: { timeout: '15m' } });
    expect(t.layers[0].edges[1].protocol).toBe('a2a');
  });

  it('shows short markers on the node', async () => {
    const t = await buildTower(def, 't', fs, []);
    expect(opsMarks(t.layers[0].nodes[1].ops)).toEqual(['×3–5', 'PII', '$2']);
    expect(opsMarks(t.layers[0].nodes[0].ops)).toEqual(['WEBHOOK']);
  });

  it('rejects bad durations and unknown protocols', () => {
    const bad = (node: object) => TowerSchema.safeParse({ name: 'x', layers: [{ id: 'l', title: 'L', nodes: [{ id: 'a', ...node }] }] }).success;
    expect(bad({ sla: '3 days' })).toBe(false);
    expect(bad({ limits: { timeout: '90s', ttl: '8h' } })).toBe(true);
    expect(bad({ fanout: 1 })).toBe(false);
    expect(TowerSchema.safeParse({ name: 'x', layers: [{ id: 'l', title: 'L', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', protocol: 'smoke' }] }] }).success).toBe(false);
  });

  it('compares evals with their target', () => {
    expect(evalPasses({ name: 'x', value: 0.9, target: 0.8 })).toBe(true);
    expect(evalPasses({ name: 'latency', value: 900, target: 500, higher_is_better: false })).toBe(false);
    expect(evalPasses({ name: 'x', value: 'B+' })).toBeUndefined();
  });
});
