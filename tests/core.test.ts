import { describe, expect, it } from 'vitest';
import { parseEdge } from '../src/core/edges';
import { buildTower, safeJoin } from '../src/core/loader';
import { detectVars, parseAgentMarkdown } from '../src/core/resolve';
import { TowerSchema } from '../src/core/schema';
import type { Issue } from '../src/core/types';

const files: Record<string, string> = {
  'p.md': 'Hello {{user}}, today is {{ date }}.',
  'agents/rev.md': '---\nname: reviewer\nmodel: sonnet\ntools: Read, Grep\n---\nYou review code.',
};
const fs = { read: async (p: string) => files[p] };

describe('parseEdge', () => {
  it('parses shorthand with kind and label', () => {
    expect(parseEdge('a -> b [spawn]: go')).toEqual({ from: 'a', to: 'b', kind: 'spawn', label: 'go' });
    expect(parseEdge('l1.a->l2.b')).toMatchObject({ from: 'l1.a', to: 'l2.b', kind: 'flow' });
    expect(parseEdge('my-node -> b')).toMatchObject({ from: 'my-node', to: 'b' });
  });
  it('rejects unknown kinds and garbage', () => {
    expect(parseEdge('a -> b [teleport]')).toBeTypeOf('string');
    expect(parseEdge('a b')).toBeTypeOf('string');
  });
});

describe('prompts and agents', () => {
  it('detects template vars', () => expect(detectVars(files['p.md'])).toEqual(['user', 'date']));
  it('parses agent frontmatter', () => {
    const { fields, body } = parseAgentMarkdown(files['agents/rev.md']);
    expect(fields).toMatchObject({ name: 'reviewer', tools: 'Read, Grep' });
    expect(body).toBe('You review code.');
  });
});

describe('buildTower', () => {
  const def = TowerSchema.parse({
    name: 'T',
    prompts: { main: { file: 'p.md' } },
    agents: { rev: { from: 'agents/rev.md' }, boss: { model: 'opus', prompt: 'main', tower: 'boss.tower.yaml' } },
    layers: [
      { id: 'top', title: 'Top', nodes: [{ id: 'boss', agent: 'boss' }, { id: 'rev', agent: 'rev' }], edges: ['boss -> rev [spawn]'] },
      { id: 'low', title: 'Low', nodes: [{ id: 'x', type: 'tool' }, { id: 'lonely' }] },
    ],
    links: ['top.rev -> low.x [call]', 'top.rev -> low.ghost'],
  });

  it('resolves references and reports issues', async () => {
    const issues: Issue[] = [];
    const t = await buildTower(def, 't', fs, issues);
    const [boss, rev] = t.layers[0].nodes;
    expect(boss).toMatchObject({ type: 'agent', model: 'opus', tower: 'boss.tower.yaml' });
    expect(boss.prompt?.vars).toEqual(['user', 'date']);
    expect(rev).toMatchObject({ label: 'reviewer', model: 'sonnet', tools: ['Read', 'Grep'], files: ['agents/rev.md'] });
    expect(rev.prompt?.text).toBe('You review code.');
    expect(t.links).toHaveLength(1);
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', message: expect.stringContaining('low.ghost') }));
    expect(issues).toContainEqual(expect.objectContaining({ level: 'info', path: 'low.lonely' }));
  });

  it('rejects unknown keys (typos)', () => {
    expect(TowerSchema.safeParse({ name: 'x', layers: [{ id: 'a', title: 'A', nodes: [{ id: 'n', lable: 'oops' }] }] }).success).toBe(false);
  });
});

describe('safeJoin', () => {
  it('blocks path traversal', () => {
    expect(safeJoin('/srv/root', 'a/b.ts')).toBe('/srv/root/a/b.ts');
    expect(safeJoin('/srv/root', '../etc/passwd')).toBeUndefined();
    expect(safeJoin('/srv/root', '/etc/passwd')).toBeUndefined();
    expect(safeJoin('/srv/root', '../rootkit/x')).toBeUndefined();
  });
});
