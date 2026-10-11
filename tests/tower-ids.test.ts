/**
 * Project ids per entry (#121): with several unrelated entries the filesystem root must not leak into an
 * id. `towerIds` is the pure helper the loader and the library badges share, so they always agree.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commonDir, loadLibrary, toId, towerIds } from '../src/core/loader';

const root = mkdtempSync(join(tmpdir(), 'flow-tower-ids-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const tower = (name: string, extra = '') => `name: ${name}\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: n${extra} }\n`;

/** A throwaway folder under the shared temp root: each test gets its own tree. */
function folder(...parts: string[]): string {
  const dir = join(root, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A tower file, created with its parent folder. */
function towerFile(...parts: string[]): string {
  const file = join(folder(...parts.slice(0, -1)), `${parts[parts.length - 1]}.tower.yaml`);
  writeFileSync(file, tower(parts[parts.length - 1]));
  return file;
}

describe('towerIds (#121)', () => {
  it("one entry keeps today's ids: the path under the common folder", () => {
    const a = towerFile('single', 'a');
    const sub = towerFile('single', 'towers', 'sub');
    const idOf = towerIds([folder('single')], [a, sub]);
    expect([a, sub].map(idOf)).toEqual(['a.tower.yaml', 'towers/sub.tower.yaml']);
  });

  it('no entry keeps the common-folder id too', () => {
    const a = towerFile('none', 'a');
    const idOf = towerIds([], [a]);
    expect(idOf(a)).toBe('a.tower.yaml');
  });

  it('two unrelated entries give <label>/… ids with no absolute path segment', () => {
    const a = towerFile('unrelated', 'proj-a', 'a');
    const b = towerFile('unrelated', 'proj-b', 'b');
    const files = [a, b];
    const ids = files.map(towerIds([folder('unrelated', 'proj-a'), folder('unrelated', 'proj-b')], files));
    expect(ids).toEqual(['proj-a/a.tower.yaml', 'proj-b/b.tower.yaml']);
    // The user name and the personal prefix never reach a URL.
    for (const id of ids) expect(id.startsWith(root + sep)).toBe(false);
  });

  it('two entries with the same basename get x/… and x-2/…', () => {
    const a = towerFile('clash', 'one', 'x', 'a');
    const b = towerFile('clash', 'two', 'x', 'b');
    expect([a, b].map(towerIds([folder('clash', 'one', 'x'), folder('clash', 'two', 'x')], [a, b]))).toEqual(['x/a.tower.yaml', 'x-2/b.tower.yaml']);
  });

  it('a file entry uses its parent folder as the entry folder', () => {
    const a = towerFile('file-entry', 'proj', 'a');
    const b = towerFile('file-entry', 'elsewhere', 'b');
    expect([a, b].map(towerIds([a, b], [a, b]))).toEqual(['proj/a.tower.yaml', 'elsewhere/b.tower.yaml']);
  });

  it('a nested tower under no entry folder falls back to the common-folder id', () => {
    // File entries pick out only their own folders; this nested tower sits in neither, so there is no label
    // to give it and the old common-folder id is what is left.
    const a = towerFile('fallback', 'sub-a', 'a');
    const b = towerFile('fallback', 'sub-b', 'b');
    const nested = towerFile('fallback', 'other-x', 'n');
    const files = [a, b, nested];
    const idOf = towerIds([a, b], files);
    expect(idOf(a)).toBe('sub-a/a.tower.yaml');
    expect(idOf(b)).toBe('sub-b/b.tower.yaml');
    expect(idOf(nested)).toBe(toId(commonDir(files), nested));
  });
});

describe('loadLibrary ids (#121)', () => {
  it('keeps ids per entry when the entries share no folder', async () => {
    // Two file entries, one per project: the entry folder is the folder holding the tower file.
    const sre = folder('library', 'sre');
    folder('library', 'sre', '.git');
    writeFileSync(join(sre, 'sre.tower.yaml'), tower('Sre'));
    const rag = folder('library', 'rag-bot', 'towers');
    folder('library', 'rag-bot', '.git');
    writeFileSync(join(rag, 'rag.tower.yaml'), tower('Rag', ', tower: ../shared/sub.tower.yaml'));
    const nested = join(folder('library', 'rag-bot', 'shared'), 'sub.tower.yaml');
    writeFileSync(nested, tower('Sub'));

    const { workspace } = await loadLibrary([join(rag, 'rag.tower.yaml'), join(sre, 'sre.tower.yaml')]);
    expect(workspace.projects).toEqual(['towers/rag.tower.yaml', 'sre/sre.tower.yaml']);
    // The nested tower sits under no entry folder (the entries are the two files): it takes the fallback id,
    // the path under the common folder of everything served.
    expect(workspace.towers['towers/rag.tower.yaml'].layers[0].nodes[0].tower).toBe('rag-bot/shared/sub.tower.yaml');
    // Nothing served through this library wears the personal prefix.
    for (const id of Object.keys(workspace.towers)) expect(id.startsWith(root + sep)).toBe(false);
  });
});
