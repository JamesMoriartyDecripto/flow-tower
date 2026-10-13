import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Issue } from '../src/core/types';
import { collectTower } from '../src/server/share-client';
import { sharedTowersHandler, structuralErrors } from '../src/server/shared-towers';
import { tokenStore } from '../src/server/tokens';

/**
 * Validation before a share replaces the hub's copy (#190): the satellite refuses a folder whose tower the
 * loader rejects, and the hub refuses a structurally broken staging folder with 422, keeping the last good copy.
 */

const tempFolder = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

/** A valid two-node tower; `extra` appends to it, so each test changes one thing. */
const GOOD = [
  'name: demo',
  'layers:',
  '  - id: main',
  '    title: Main',
  '    nodes:',
  '      - id: a',
  '        label: A',
  '      - id: b',
  '        label: B',
  '    edges:',
  '      - a -> b',
  '',
].join('\n');

function towerFolder(name: string, body: string): string {
  const dir = join(tempFolder('flow-tower-validate-'), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.tower.yaml`), body);
  return dir;
}

describe('collectTower refuses a broken tower (#190)', () => {
  it('refuses a folder whose tower has a missing edge endpoint, and names the file', async () => {
    const dir = towerFolder('broken', GOOD.replace('a -> b', 'a -> ghost'));
    const res = await collectTower(dir, { withFiles: false });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.error).toContain('broken.tower.yaml');
    expect(res.error).toContain('ghost');
  });

  it('lets a warning-only tower through', async () => {
    // A label longer than the card shows is a warning, which never blocks a share.
    const body = GOOD.replace('label: A', 'label: a very long label that the card cannot show');
    const dir = towerFolder('warned', body);
    const res = await collectTower(dir, { withFiles: false });
    expect('files' in res).toBe(true);
  });
});

describe('the hub refuses a structurally broken share (#190)', () => {
  const library = tempFolder('flow-tower-validate-lib-');
  const home = tempFolder('flow-tower-validate-home-');
  const { token } = tokenStore(home).create('box-v');
  let server: Server;
  let base = '';

  beforeAll(async () => {
    server = createServer(sharedTowersHandler({ library, home, hub: true }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const put = (name: string, content: string) =>
    fetch(`${base}${name}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-flow-tower-token': token },
      body: JSON.stringify({ files: [{ path: 'demo.tower.yaml', content }] }),
    });

  it('answers 422 for a duplicate node id and leaves the previous version in place', async () => {
    expect((await put('guarded', GOOD)).status).toBe(200);
    const dup = GOOD.replace('- id: b', '- id: a');
    const res = await put('guarded', dup);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; state: string };
    expect(body.state).toBe('invalid');
    expect(body.error).toContain('the tower has errors: demo.tower.yaml');
    expect(body.error).toContain('duplicate node id');
    const kept = join(library, 'towers', 'box-v', 'guarded', 'demo.tower.yaml');
    expect(readFileSync(kept, 'utf8')).toBe(GOOD);
  });

  it('accepts a YAML-only tower whose prompt file is missing', async () => {
    const yaml = [
      'name: yaml-only',
      'prompts:',
      '  p1:',
      '    file: prompts/missing.md',
      'layers:',
      '  - id: main',
      '    title: Main',
      '    nodes:',
      '      - id: a',
      '        label: A',
      '        prompt: p1',
      '',
    ].join('\n');
    const res = await put('yaml-only', yaml);
    expect(res.status).toBe(200);
    expect(existsSync(join(library, 'towers', 'box-v', 'yaml-only', 'demo.tower.yaml'))).toBe(true);
  });
});

describe('structuralErrors classifies by code (#190)', () => {
  it('keeps an error whose text mimics a missing file when it has no code', () => {
    const issues: Issue[] = [
      { level: 'error', message: 'file not found: a', path: 'main.a' },
      { level: 'error', message: 'prompt file not found: x.md', path: 'prompts.p', code: 'missing-file' },
      { level: 'error', message: 'x.md is outside the project (/p): not read', code: 'outside-project' },
    ];
    expect(structuralErrors(issues).map((i) => i.message)).toEqual(['file not found: a']);
  });
});

describe('structuralErrors (#190)', () => {
  it('keeps a duplicate-id error and drops a prompt file not found one', () => {
    const issues: Issue[] = [
      { level: 'error', message: 'duplicate node id "a"', path: 'main.a' },
      { level: 'error', message: 'prompt file not found: prompts/x.md', path: 'prompts.p1', code: 'missing-file' },
      { level: 'error', message: 'agent file not found: agents/y.md', path: 'agents.g', code: 'missing-file' },
      { level: 'error', message: 'x.md is outside the project (/p): not read', code: 'outside-project' },
      { level: 'error', message: 'x.md is a secret file or in the user folder (~/.config/flow-tower): not read', code: 'secret-file' },
      { level: 'warning', message: 'duplicate node id "z"', path: 'main.z' },
    ];
    expect(structuralErrors(issues).map((i) => i.message)).toEqual(['duplicate node id "a"']);
  });
});
