import { describe, expect, it } from 'vitest';
import { clampLevel, resolveTower } from '../src/app/doc/resolve';
import { loadLibrary } from '../src/core/loader';

const { workspace: ws } = await loadLibrary(['examples/db-api-playbook', 'examples/physics-notes']);
const request = 'db-api-playbook/towers/request.tower.yaml';

describe('document view: ?doc= resolution', () => {
  it('resolves a tower by id, file name or name', () => {
    expect(resolveTower(ws, request)).toBe(request);
    expect(resolveTower(ws, 'request')).toBe(request);
    expect(resolveTower(ws, 'database api playbook')).toBe('db-api-playbook/db-api-playbook.tower.yaml');
  });

  it('returns undefined for an unknown or empty tower', () => {
    expect(resolveTower(ws, 'nope')).toBeUndefined();
    expect(resolveTower(ws, '')).toBeUndefined();
  });
});

describe('document view: ?level=', () => {
  it('defaults to 2 and clamps to 1-3', () => {
    expect(clampLevel(null)).toBe(2);
    expect(clampLevel('')).toBe(2);
    expect(clampLevel('abc')).toBe(2);
    expect(clampLevel('0')).toBe(1);
    expect(clampLevel('-4')).toBe(1);
    expect(clampLevel('2')).toBe(2);
    expect(clampLevel('9')).toBe(3);
    expect(clampLevel('2.6')).toBe(3);
  });
});
