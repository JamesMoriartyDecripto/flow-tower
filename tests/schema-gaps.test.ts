import { describe, expect, it } from 'vitest';
import { dataRows, opsMarks, opsRows } from '../src/app/ops';
import { edgeText } from '../src/app/layout';
import { buildTower } from '../src/core/loader';
import { TowerSchema } from '../src/core/schema';
import type { Issue } from '../src/core/types';

/** The fields added for #31: every gap the presets hit, written the way a preset would use it. */
const tower = {
  name: 'Gaps',
  budget: [{ amount: 25, currency: 'EUR', per: 'run', for: 'model' }, { usd: 40, per: 'month', for: 'media', rate: '0.40 USD/s of video' }],
  limits: { timeout: '2h', description: 'one release' },
  agents: {
    writer: { skills: ['brand-voice', 'citations'], disabled_tools: ['WebFetch'], fanout: { max: 12, by: ['store', 'locale', 'device'], from: ['ios', 'android'], pick: 'weighted by queue priority' } },
  },
  layers: [{
    id: 'l',
    title: 'L',
    nodes: [
      { id: 'tick', type: 'entry', trigger: { kind: 'cron', schedule: '0 9 * * 1-5', timezone: 'Europe/Rome', hours: 'Mon-Fri 09:00-18:00' } },
      { id: 'w', agent: 'writer', limits: { rate: ['100/24h', '300/5m'] }, data: { sensitivity: 'biometric', retention: '7y', retention_after: 'matter close', lawful_basis: 'legitimate_interests', disclosure: ['C2PA', 'AI-generated label'] } },
      { id: 'mem', type: 'memory', data: { retention: 'none' } },
      { id: 'gate', type: 'decision', decision: { output: 'binary', threshold: 0.8, confidence: true, model: 'risk-v3', fail: 'closed' } },
      { id: 'ok', type: 'human', approval: { by: 'CFO', when: 'refund > 500 EUR', per: 'refund', via: ['Slack', 'email'], relayed_by: 'concierge', rounds: 2, actions: ['approve', 'dismiss', 'takeover'], timeout: '4h', on_timeout: 'escalate', escalate_to: 'CEO' } },
      { id: 'pay', type: 'tool', exactly_once: true, sla: { within: '5d', business: true, after: 'SDI rejection' } },
      { id: 'render', type: 'tool', async: { mode: 'poll', interval: '10s', timeout: '30m' }, sla: { before: 'release', external: true } },
      { id: 'ship', type: 'output', rollout: { strategy: 'staged', steps: [1, 5, 25, 100], metric: 'crash-free sessions', guard: 'crash-free < 99.5%' }, evals: [{ name: 'Elo', value: 1240, unit: 'Elo', illustrative: true }] },
    ],
    edges: [
      { from: 'tick', to: 'w', kind: 'spawn', async: true },
      { from: 'gate', to: 'ok', group: 'escalation', label: 'risky' },
      { from: 'gate', to: 'pay', group: 'escalation', label: 'safe' },
      { from: 'w', to: 'ship', protocol: 'a2a', version: '0.3', card: 'https://agents.example.com/.well-known/agent.json' },
      { from: 'ship', to: 'render', protocol: 'manual', label: 'KDP upload' },
    ],
  }],
};

describe('schema gaps (#31)', () => {
  it('accepts every new field', () => {
    const parsed = TowerSchema.safeParse(tower);
    expect(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });

  it('rejects malformed rates and currencies', () => {
    const bad = (patch: object) => TowerSchema.safeParse({ ...tower, ...patch }).success;
    expect(bad({ limits: { rate: '100 per day' } })).toBe(false);
    expect(bad({ budget: { amount: 5, currency: 'euro' } })).toBe(false);
  });

  it('shows them in the node panel, markers and edge labels', async () => {
    const issues: Issue[] = [];
    const t = await buildTower(TowerSchema.parse(tower), 'gaps', { read: async () => undefined }, issues);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    const node = (id: string) => t.layers[0].nodes.find((n) => n.id === id)!;
    expect(t.run?.budget).toHaveLength(2);

    expect(opsRows(node('tick').ops).trigger).toBe('cron "0 9 * * 1-5" Mon-Fri 09:00-18:00 (Europe/Rome)');
    expect(opsRows(node('w').ops)['fan-out']).toBe('×1–12 parallel by store × locale × device from ios, android (weighted by queue priority)');
    expect(opsRows(node('w').ops).limits).toBe('quota 100/24h, 300/5m');
    expect(dataRows(node('w').ops.data)).toMatchObject({ retention: '7y after matter close', 'lawful basis': 'legitimate interests', disclosure: 'C2PA, AI-generated label' });
    expect(dataRows(node('mem').ops.data).retention).toBe('none (in memory only)');
    expect(opsRows(node('gate').ops).decision).toBe('binary threshold 0.8 with confidence model risk-v3 fail-closed');
    expect(opsRows(node('ok').ops).approval).toContain('when refund > 500 EUR per refund via Slack / email relayed by concierge');
    expect(opsRows(node('pay').ops).sla).toBe('5d business after SDI rejection');
    expect(opsRows(node('render').ops).async).toBe('poll every 10s timeout 30m');
    expect(opsRows(node('ship').ops).version).toContain('staged steps 1% → 5% → 25% → 100% on crash-free sessions halt if crash-free < 99.5%');

    expect(opsMarks(node('w').ops)).toContain('BIO');
    expect(opsMarks(node('pay').ops)).toContain('1×');
    expect(opsMarks(node('render').ops)).toContain('POLL');

    const edges = t.layers[0].edges;
    expect(edgeText(edges[0])).toBe('ASYNC');
    expect(edgeText(edges[1])).toBe('risky · ALT escalation');
    expect(edgeText(edges[3])).toBe('A2A 0.3');
    expect(node('w').agent?.skills).toEqual(['brand-voice', 'citations']);
    expect(node('w').agent?.disabledTools).toEqual(['WebFetch']);
  });
});
