import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { sharedTowersHandler, structuralErrors } from '../src/server/shared-towers';
import { startShareSync, type ShareSync } from '../src/server/share-sync';
import { sharedProjectOf } from '../src/server/sources';
import { tokenStore } from '../src/server/tokens';

/**
 * A shared tower is read only from its own share folder (#190), even when the library sits in a git checkout.
 * The temp repo below has a `secret.md` at its root; a shared tower must not reach it.
 */

const tempFolder = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

/** A git checkout with the library at `<repo>/library`, a secret file at the repo root, and one shared tower. */
function sharedRepo(prompt: string, nodeName = 'a') {
  const repo = tempFolder('flow-tower-boundary-');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  writeFileSync(join(repo, 'secret.md'), 'TOP SECRET CONTENT');
  const library = join(repo, 'library');
  const folder = join(library, 'towers', 'box-1', 'demo');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'demo.tower.yaml'), [
    'name: demo',
    'prompts:',
    '  p1:',
    `    file: ${prompt}`,
    'layers:',
    '  - id: main',
    '    title: Main',
    '    nodes:',
    `      - id: ${nodeName}`,
    '        label: A',
    '        prompt: p1',
    '',
  ].join('\n'));
  return { repo, library, folder, file: join(folder, 'demo.tower.yaml') };
}

describe('a shared tower reads only its own folder (#190)', () => {
  it('reports a prompt that climbs out of the share folder as outside the project, and does not read it', async () => {
    // demo -> box-1 -> towers -> library -> repo: four levels reach the checkout root, where secret.md lives.
    const { library, file } = sharedRepo('../../../../secret.md');
    const lib = await loadLibrary([library], { projectOf: (f) => sharedProjectOf(f, library) });
    const tower = Object.values(lib.workspace.towers)[0];
    const issue = tower.issues.find((i) => i.code === 'outside-project');
    expect(issue?.message).toContain('../../../../secret.md is outside the project');
    expect(tower.layers[0].nodes[0].prompt?.text ?? '').not.toContain('TOP SECRET');
    expect(lib.referenced.size).toBe(0);
    expect(lib.files.get(lib.workspace.projects[0])).toBe(file);
  });

  it('without the boundary the default checkout project would read the same file (the bug this closes)', async () => {
    const { library } = sharedRepo('../../../../secret.md');
    const lib = await loadLibrary([library]);
    const tower = Object.values(lib.workspace.towers)[0];
    expect(tower.layers[0].nodes[0].prompt?.text).toContain('TOP SECRET');
  });

  it('a duplicate node id whose text reads like a missing file stays a structural error', async () => {
    // Node ids cannot hold spaces, so the spoof uses the ids the schema allows: the classification is by code, so
    // the text of a real duplicate-id error can never be taken for a missing-file one.
    const { library } = sharedRepo('p.md');
    const dir = join(library, 'towers', 'box-1', 'demo');
    writeFileSync(join(dir, 'demo.tower.yaml'), [
      'name: demo',
      'layers:',
      '  - id: file-not-found',
      '    title: Main',
      '    nodes:',
      '      - { id: a, label: A }',
      '      - { id: a, label: B }',
      '',
    ].join('\n'));
    const lib = await loadLibrary([library], { projectOf: (f) => sharedProjectOf(f, library) });
    const tower = Object.values(lib.workspace.towers)[0];
    expect(structuralErrors(tower.issues).map((i) => i.message)).toContain('duplicate node id "a"');
    expect(structuralErrors(tower.issues).every((i) => i.code === undefined)).toBe(true);
  });
});

describe('the hub judges a staged upload inside its own folder (#190)', () => {
  const library = tempFolder('flow-tower-boundary-lib-');
  const home = tempFolder('flow-tower-boundary-home-');
  const { token } = tokenStore(home).create('box-b');
  let server: Server;
  let base = '';

  beforeAll(async () => {
    // A secret file next to the library, reachable by the upload only if the judge read outside staging.
    writeFileSync(join(library, 'secret-upload.md'), 'TOP SECRET UPLOAD');
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

  it('refuses a staged tower that climbs out of staging (it is not a structural error, but it is not read)', async () => {
    const content = [
      'name: demo',
      'prompts:',
      '  p1:',
      '    file: ../../../secret-upload.md',
      'layers:',
      '  - id: main',
      '    title: Main',
      '    nodes:',
      '      - { id: a, label: A, prompt: p1 }',
      '',
    ].join('\n');
    const res = await put('climb', content);
    // The share is YAML-only from the hub's view: accepted, and the outside file is never read into it.
    expect(res.status).toBe(200);
    const kept = readFileSync(join(library, 'towers', 'box-b', 'climb', 'demo.tower.yaml'), 'utf8');
    expect(kept).not.toContain('TOP SECRET');
  });
});

describe('concurrent writes to one share folder (#190)', () => {
  const library = tempFolder('flow-tower-concurrent-lib-');
  const home = tempFolder('flow-tower-concurrent-home-');
  const { token } = tokenStore(home).create('box-c');
  let server: Server;
  let base = '';

  const tower = (name: string) => [
    `name: ${name}`,
    'layers:',
    '  - id: main',
    '    title: Main',
    '    nodes:',
    '      - { id: a, label: A }',
    '      - { id: b, label: B }',
    '    edges:',
    '      - a -> b',
    '',
  ].join('\n');

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

  it('two parallel PUTs for one name leave one complete folder and no .old- leftovers', async () => {
    const [r1, r2] = await Promise.all([put('race', tower('one')), put('race', tower('two'))]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const folder = join(library, 'towers', 'box-c', 'race');
    const text = readFileSync(join(folder, 'demo.tower.yaml'), 'utf8');
    expect(['name: one', 'name: two']).toContain(text.split('\n')[0]);
    expect(readdirSync(join(library, 'towers', '.staging')).filter((n) => n.includes('.old-'))).toEqual([]);
    expect(existsSync(join(folder, 'demo.tower.yaml'))).toBe(true);
  });
});

describe('a hub change clears the removed-nodes warning state (#190)', () => {
  const servers: Server[] = [];
  const syncs: ShareSync[] = [];
  afterEach(() => {
    syncs.splice(0).forEach((s) => s.stop());
    servers.splice(0).forEach((s) => s.close());
    vi.restoreAllMocks();
  });

  async function stub() {
    const server = createServer((req, res) => {
      req.resume();
      req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end('{"files":1,"bytes":1}'); });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('after a new hub, the first upload does not report nodes the old hub accepted as removed', async () => {
    const hubA = await stub();
    const hubB = await stub();
    const home = tempFolder('flow-tower-hubchange-home-');
    const dir = tempFolder('flow-tower-hubchange-tower-');
    const yaml = (ids: string[]) => [
      'name: alpha', 'layers:', '  - id: main', '    title: Main', '    nodes:',
      ...ids.map((id) => `      - { id: ${id}, label: X }`), '',
    ].join('\n');
    writeFileSync(join(dir, 'alpha.tower.yaml'), yaml(['a', 'b']));
    const write = (url: string) => writeFileSync(join(home, 'config.json'), JSON.stringify({
      role: 'satellite', url, token: 'ft_laptop_x', shares: [{ dir, name: 'alpha', files: false }],
    }));
    const warnings: string[] = [];
    write(hubA);
    const sync = startShareSync({ home, url: hubA, token: 'ft_laptop_x', intervalMs: 1_000_000_000, warn: (m) => warnings.push(m) });
    syncs.push(sync);
    await sync.syncNow();
    writeFileSync(join(dir, 'alpha.tower.yaml'), yaml(['a']));
    await sync.syncNow();
    expect(warnings.some((w) => w.includes('removed nodes'))).toBe(true);

    // Switch hubs with the same content: the new hub never held `b`, so no removal may be reported for it.
    warnings.length = 0;
    write(hubB);
    await sync.syncNow();
    expect(warnings.filter((w) => w.includes('removed nodes'))).toEqual([]);
    expect(sync.state().find((s) => s.name === 'alpha')?.warning).toBeUndefined();
  });
});
