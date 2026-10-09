import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkspace } from '../src/core/loader';

const entries = readdirSync('examples', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tower.yaml'))
  .map((f) => join('examples', f));

describe.each(entries)('%s', (file) => {
  it('loads without errors or warnings', async () => {
    const { workspace } = await loadWorkspace(file);
    const problems = Object.values(workspace.towers).flatMap((t) => t.issues.filter((i) => i.level !== 'info').map((i) => `${t.id}: ${i.path ?? ''} ${i.message}`));
    expect(problems).toEqual([]);
  });
});

describe('examples are complete in git', () => {
  it('has no git-ignored files (they would be missing on a fresh clone)', () => {
    const ignored = execSync('git ls-files --others --ignored --exclude-standard examples', { encoding: 'utf8' }).trim();
    expect(ignored).toBe('');
  });
});
