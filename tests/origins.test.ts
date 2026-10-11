/**
 * Library origins (#121c): the pure helper the plugin uses to tag a `flow-tower library` serve's projects
 * as the user's own (MINE) or a shipped example (EXAMPLE). Plain paths only: no server, no Vite.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { classifyOrigin, libraryOrigins, minePaths } from '../src/server/origins';

const root = mkdtempSync(join(tmpdir(), 'flow-tower-origins-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const tower = (name: string) => `name: ${name}\nlayers:\n  - id: l\n    title: L\n    nodes:\n      - { id: n }\n`;

const checkout = join(root, 'checkout');
const proj = join(root, 'proj');
mkdirSync(join(checkout, 'examples', 'demo'), { recursive: true });
mkdirSync(proj, { recursive: true });
const exampleFile = join(checkout, 'examples', 'demo', 'demo.tower.yaml');
const mineFile = join(proj, 'app.tower.yaml');
writeFileSync(exampleFile, tower('Demo'));
writeFileSync(mineFile, tower('App'));

describe('classifyOrigin (#121c)', () => {
  const opts = { checkout, mine: [proj] };

  it('is "example" for a file under the checkout examples', () => {
    expect(classifyOrigin(exampleFile, opts)).toBe('example');
  });

  it('is "mine" for a file under one of the user paths', () => {
    expect(classifyOrigin(mineFile, opts)).toBe('mine');
  });

  it('is undefined for a file under neither', () => {
    expect(classifyOrigin(join(root, 'elsewhere', 'x.tower.yaml'), opts)).toBeUndefined();
  });

  it('judges by the real path: a link into examples stays an example', () => {
    // A symlink in the user's folder pointing at an example must not smuggle it in as "mine".
    const link = join(proj, 'link.tower.yaml');
    symlinkSync(exampleFile, link);
    expect(classifyOrigin(link, opts)).toBe('example');
  });
});

describe('libraryOrigins (#121c)', () => {
  const entries = [mineFile, join(checkout, 'examples')];

  it('maps the project ids the loader will use to their origin', () => {
    const origins = libraryOrigins(entries, ['proj/app.tower.yaml', 'checkout/examples/demo/demo.tower.yaml'], { checkout, mine: [proj] });
    expect(origins).toEqual({ 'proj/app.tower.yaml': 'mine', 'checkout/examples/demo/demo.tower.yaml': 'example' });
  });

  it('keeps only projects, never a nested tower id', () => {
    const origins = libraryOrigins(entries, ['proj/app.tower.yaml'], { checkout, mine: [proj] });
    expect(Object.keys(origins)).toEqual(['proj/app.tower.yaml']);
  });

  it('an empty entry list yields no origins', () => {
    expect(libraryOrigins([], ['x.tower.yaml'], { checkout, mine: [proj] })).toEqual({});
  });
});

describe('minePaths (#121c)', () => {
  it('reads the JSON array the CLI passes in FLOW_TOWER_MINE', () => {
    expect(minePaths(JSON.stringify([proj, '/other']))).toEqual([proj, '/other']);
  });

  it('treats an absent or hand-broken value as no paths', () => {
    expect(minePaths(undefined)).toEqual([]);
    expect(minePaths('not json')).toEqual([]);
    expect(minePaths('{"a":1}')).toEqual([]);
    expect(minePaths('[1,"two"]')).toEqual(['two']);
  });
});