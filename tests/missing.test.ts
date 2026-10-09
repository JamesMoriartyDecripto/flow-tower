import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';

describe('missing references', () => {
  it('are tracked, so creating the file can trigger a reload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
    writeFileSync(join(dir, 't.tower.yaml'), 'name: T\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: a, files: [later.md] }\n');
    const before = await loadLibrary([dir]);
    expect([...before.missing]).toContain(join(dir, 'later.md'));
    writeFileSync(join(dir, 'later.md'), '# later');
    const after = await loadLibrary([dir]);
    expect(after.missing.size).toBe(0);
    expect(after.workspace.towers['t.tower.yaml'].issues.filter((i) => i.level === 'warning')).toEqual([]);
  });
});
