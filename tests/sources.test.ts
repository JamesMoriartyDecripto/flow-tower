import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { projectSources } from '../src/server/sources';

/** Projects as the plugin passes them: the id and the absolute tower file. */
const at = (library: string, rel: string) => ({ id: rel, file: join(library, rel) });
const TOWER = 'name: demo\nlayers: []\n';

describe('projectSources (#165)', () => {
  const library = '/hub/lib';

  it('names the machine folder a shared tower sits in', () => {
    expect(projectSources([at(library, 'towers/box-1/demo/x.tower.yaml')], library)).toEqual({
      'towers/box-1/demo/x.tower.yaml': 'box-1',
    });
  });

  it('takes the machine from a nested folder too', () => {
    const p = at(library, 'towers/box-1/a/b/y.tower.yaml');
    expect(projectSources([p, at(library, 'root.tower.yaml')], library)?.[p.id]).toBe('box-1');
  });

  it('marks a tower at the library root as local, and a shared one as its machine', () => {
    const root = at(library, 'root.tower.yaml');
    const shared = at(library, 'towers/box-1/demo/x.tower.yaml');
    expect(projectSources([root, shared], library)).toEqual({ [root.id]: 'local', [shared.id]: 'box-1' });
  });

  it('treats towersx/ and a towers/ folder outside the library as local', () => {
    const sibling = at(library, 'towersx/box-1/demo/x.tower.yaml');
    const outside = { id: 'other', file: '/hub/towers/box-1/demo/x.tower.yaml' };
    const shared = at(library, 'towers/box-1/demo/x.tower.yaml');
    expect(projectSources([sibling, outside, shared], library)).toEqual({
      [sibling.id]: 'local', other: 'local', [shared.id]: 'box-1',
    });
    expect(projectSources([sibling, outside], library)).toBeUndefined();
  });

  it('is undefined when no project was shared by a device', () => {
    expect(projectSources([at(library, 'a.tower.yaml')], library)).toBeUndefined();
    expect(projectSources([], library)).toBeUndefined();
  });

  it('is undefined without a library folder', () => {
    expect(projectSources([at(library, 'towers/box-1/demo/x.tower.yaml')], undefined)).toBeUndefined();
  });

  it('reads the real loader: a root tower is local, a shared one is mac', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-sources-'));
    mkdirSync(join(dir, 'towers', 'mac', 't'), { recursive: true });
    writeFileSync(join(dir, 'root.tower.yaml'), TOWER);
    writeFileSync(join(dir, 'towers', 'mac', 't', 't.tower.yaml'), TOWER);
    const loaded = await loadLibrary([dir]);
    const projects = loaded.workspace.projects.map((id) => ({ id, file: loaded.files.get(id)! }));
    const sources = projectSources(projects, dir);
    expect(Object.values(sources ?? {}).sort()).toEqual(['local', 'mac']);
    expect(sources?.[projects.find((p) => p.file.includes('towers'))!.id]).toBe('mac');
  });
});
