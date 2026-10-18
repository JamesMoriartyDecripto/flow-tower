import { describe, expect, it } from 'vitest';
import { auditTower, type Finding } from '../src/core/audit';
import { buildTower } from '../src/core/loader';
import { TowerSchema, type TowerDef } from '../src/core/schema';
import type { ResolvedTower } from '../src/core/types';

const none = { read: async () => undefined };

/** Builds a resolved tower from a plain definition, the same way the loader does. */
async function build(def: Partial<TowerDef> & { nodes: Record<string, unknown>[]; edges?: string[]; links?: string[] }): Promise<ResolvedTower> {
  const { nodes, edges = [], links = [], ...rest } = def;
  const parsed = TowerSchema.parse({
    name: 'T',
    ...rest,
    layers: [{ id: 'l', title: 'L', nodes, edges }],
    links,
  });
  return buildTower(parsed, 't', none, []);
}

const aud11 = (fs: Finding[]) => fs.filter((f) => f.rule === 'AUD11');

/** An agent with Bash, so AUD11 applies, and the given sandbox (or none). */
const bashAgent = (sandbox?: Record<string, unknown>) => ({
  id: 'a',
  type: 'agent',
  model: 'm',
  tools: ['Bash'],
  ...(sandbox === undefined ? {} : { sandbox }),
});

describe('AUD11 sandbox must isolate filesystem and network', () => {
  it('no sandbox is a warning', async () => {
    const fs = aud11(auditTower(await build({ nodes: [bashAgent()] })));
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ level: 'warning' });
  });

  it('a sandbox that isolates nothing is a warning, whether it sets the fields or not', async () => {
    for (const sb of [{ network: 'open', filesystem: 'full' }, {}]) {
      const fs = aud11(auditTower(await build({ nodes: [bashAgent(sb)] })));
      expect(fs).toHaveLength(1);
      expect(fs[0]).toMatchObject({ level: 'warning' });
      expect(fs[0].message).toContain('isolates nothing');
    }
  });

  it('open network with a workspace filesystem is an info about the network', async () => {
    const fs = aud11(auditTower(await build({ nodes: [bashAgent({ network: 'open', filesystem: 'workspace' })] })));
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ level: 'info' });
    expect(fs[0].message).toContain('network');
  });

  it('an allowlist with a full filesystem is an info about the filesystem', async () => {
    const fs = aud11(auditTower(await build({ nodes: [bashAgent({ network: 'allowlist', allow: ['github.com'], filesystem: 'full' })] })));
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ level: 'info' });
    expect(fs[0].message).toContain('filesystem');
  });

  it('a sandbox that isolates both sides is quiet', async () => {
    const fs = aud11(auditTower(await build({ nodes: [bashAgent({ network: 'none', filesystem: 'read-only', description: 'container' })] })));
    expect(fs).toEqual([]);
  });

  it('a node with no shell tool is quiet even with no sandbox', async () => {
    const fs = aud11(auditTower(await build({ nodes: [{ id: 'a', type: 'agent', model: 'm', tools: ['Read'] }] })));
    expect(fs).toEqual([]);
  });
});
