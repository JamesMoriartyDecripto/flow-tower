import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditTower } from '../src/core/audit';
import { buildTower } from '../src/core/loader';
import { LimitsSchema, TowerSchema } from '../src/core/schema';

const none = { read: async () => undefined };

/**
 * Finding messages tell the user which field to add, so a field name that is not in LimitsSchema
 * sends them to a key the schema rejects (e.g. `max_turns`, which lives under harness).
 */
describe('finding messages name only real limits fields', () => {
  const known = new Set(Object.keys(LimitsSchema.shape));

  it('every limits.<field> in the audit source exists in LimitsSchema', () => {
    const source = readFileSync(new URL('../src/core/audit.ts', import.meta.url), 'utf8');
    const named = [...source.matchAll(/limits\.([a-z_]+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const field of named) expect(known.has(field), `limits.${field} is not in LimitsSchema`).toBe(true);
  });

  it('the AUD01 and AUD02 messages, as emitted, name only real fields', async () => {
    const parsed = TowerSchema.parse({
      name: 'T',
      layers: [{
        id: 'l',
        title: 'L',
        nodes: [
          { id: 'a', type: 'agent', model: 'm' },
          { id: 'b', type: 'agent', model: 'm', fanout: { max: 3 } },
        ],
        edges: ['a -> a [handoff]'],
      }],
    });
    const tower = await buildTower(parsed, 't', none, []);
    const messages = auditTower(tower).map((f) => f.message);
    const named = messages.flatMap((m) => [...m.matchAll(/limits\.([a-z_]+)/g)].map((x) => x[1]));
    expect(named.length).toBeGreaterThan(0);
    for (const field of named) expect(known.has(field)).toBe(true);
  });
});
