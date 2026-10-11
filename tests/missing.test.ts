import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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

describe('files entries that are folders (#118)', () => {
  // A folder reads fine here but /api/file answers 404 for it: the e2e sweep found it once, validate must too.
  const tower = (files: string) => `name: T\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: a, files: [${files}] }\n`;

  it('is reported like a missing file, once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
    mkdirSync(join(dir, 'integrations', 'claude-code'), { recursive: true });
    writeFileSync(join(dir, 't.tower.yaml'), tower('integrations/claude-code'));
    const { workspace } = await loadLibrary([dir]);
    const issues = workspace.towers['t.tower.yaml'].issues.filter((i) => i.level !== 'info');
    expect(issues).toEqual([
      { level: 'warning', message: 'files entry "integrations/claude-code" is a folder; list the files inside it instead', path: 'l.a' },
    ]);
  });

  it('accepts a file inside that folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
    mkdirSync(join(dir, 'integrations', 'claude-code'), { recursive: true });
    writeFileSync(join(dir, 'integrations', 'claude-code', 'SKILL.md'), '# skill');
    writeFileSync(join(dir, 't.tower.yaml'), tower('integrations/claude-code/SKILL.md'));
    const { workspace } = await loadLibrary([dir]);
    expect(workspace.towers['t.tower.yaml'].issues.filter((i) => i.level !== 'info')).toEqual([]);
  });
});
