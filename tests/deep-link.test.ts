import { describe, expect, it } from 'vitest';
import { deepLink } from '../src/app/graph';
import { loadLibrary } from '../src/core/loader';

const { workspace: ws } = await loadLibrary(['examples/db-api-playbook', 'examples/physics-notes']);
const request = 'db-api-playbook/towers/request.tower.yaml';

describe('deep links (?tower=&layer=&node=)', () => {
  it('opens a nested tower by file name, through its parent', () => {
    expect(deepLink(ws, '?tower=request')).toEqual({ stack: ['db-api-playbook/db-api-playbook.tower.yaml', request], selected: undefined, focusedLayer: undefined });
  });

  it('selects a node and focuses its layer', () => {
    expect(deepLink(ws, `?tower=${request}&node=handle.problem`)).toMatchObject({ selected: 'handle.problem', focusedLayer: 1 });
  });

  it('matches the tower name and focuses a layer by id', () => {
    expect(deepLink(ws, '?tower=database api playbook&layer=security')).toMatchObject({ stack: ['db-api-playbook/db-api-playbook.tower.yaml'], focusedLayer: 3 });
  });

  it('ignores unknown towers and plain URLs', () => {
    expect(deepLink(ws, '?tower=nope')).toBeUndefined();
    expect(deepLink(ws, '?view=map')).toBeUndefined();
  });
});
