import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
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

describe('example data files', () => {
  // Configs and samples behind the towers are read by people and tools: they must parse, not just exist.
  it('every YAML and JSON file parses', () => {
    const files = readdirSync('examples', { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ya?ml|json)$/.test(f));
    const broken = files.flatMap((f) => {
      const text = readFileSync(join('examples', f), 'utf8');
      try {
        if (f.endsWith('.json')) JSON.parse(text);
        else for (const doc of parseAllDocuments(text)) if (doc.errors.length) throw doc.errors[0];
        return [];
      } catch (e) {
        return [`${f}: ${(e as Error).message.split('\n')[0]}`];
      }
    });
    expect(broken).toEqual([]);
  });
});
