import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { addToLibrary } from '../src/cli/library.ts';
import { checkPath } from '../src/server/share-rules.ts';
import { startShareSync, type ShareSync } from '../src/server/share-sync.ts';

/**
 * Hidden folders in share rules (agent folders may be shared; every other hidden segment stays refused),
 * the removed-nodes warning of the sync loop, and the library duplicate check (#164, #121). Temp folders
 * only; the stub hub listens on 127.0.0.1:0. The token is never written into an assertion message.
 */
const TOKEN = 'ft_laptop_hiddenvalue';
const root = mkdtempSync(join(tmpdir(), 'flow-tower-hidden-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const servers: Server[] = [];
const syncs: ShareSync[] = [];
afterEach(() => {
  syncs.splice(0).forEach((s) => s.stop());
  servers.splice(0).forEach((s) => s.close());
});

const TOWER_AB = 'name: alpha\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: a, type: entry, label: A }\n      - { id: b, type: process, label: B }\n';
const TOWER_A = 'name: alpha\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: a, type: entry, label: A }\n';

describe('checkPath: hidden segments', () => {
  it.each([
    '.github/workflows/review.yml',
    '.claude/agents/x.md',
    '.claude/skills/deploy/SKILL.md',
    '.claude/commands/ship.md',
    '.agents/notes.md',
    '.codex/prompts/review.md',
  ])('allows the agent folder %s', (p) => {
    expect(checkPath(p)).toBeUndefined();
  });

  it.each([
    '.claude/x.md',
    '.claude/settings.local.json',
    '.github/../.env',
    '.staging/x.tower.yaml',
    '.git/config',
    '.env',
    '.ssh/notes.md',
    'sub/.github/workflows/review.yml',
    'docs/.claude/agents/x.md',
    '.codex/config.md',
  ])('refuses %s', (p) => {
    expect(checkPath(p)).toBeTypeOf('string');
  });
});

/** A stub hub: answers every PUT with 200, so the sync sees each upload as accepted. */
async function stubHub() {
  const server = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ files: 1, bytes: 10 }));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A user folder with one share, and a tower folder whose tower the test can rewrite. */
function setup(url: string) {
  const home = mkdtempSync(join(root, 'home-'));
  const dir = mkdtempSync(join(root, 'tower-'));
  writeFileSync(join(dir, 'alpha.tower.yaml'), TOWER_AB);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ role: 'satellite', url, token: TOKEN, shares: [{ dir, name: 'alpha', files: false }] }));
  return { home, dir };
}

function start(home: string, url: string, warn: (m: string) => void) {
  const sync = startShareSync({ home, url, token: TOKEN, intervalMs: 1_000_000_000, warn });
  syncs.push(sync);
  return sync;
}

describe('removed-nodes warning', () => {
  it('appears after a node disappears, names it, and clears on the next clean upload', async () => {
    const url = await stubHub();
    const { home, dir } = setup(url);
    const warnings: string[] = [];
    const sync = start(home, url, (m) => warnings.push(m));

    // The first upload after a start has no previous set: nothing is reported.
    await sync.syncNow();
    expect(sync.state()[0].warning).toBeUndefined();

    writeFileSync(join(dir, 'alpha.tower.yaml'), TOWER_A);
    await sync.syncNow();
    expect(sync.state()[0].warning).toBe('removed nodes: main.b (events naming them will show as unmapped)');
    expect(warnings).toHaveLength(1);

    // The same removal on the next tick is not logged again.
    writeFileSync(join(dir, 'alpha.tower.yaml'), TOWER_A.replace('label: A', 'label: A2'));
    await sync.syncNow();
    expect(sync.state()[0].warning).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('caps the named keys at five and says how many more there are', async () => {
    const url = await stubHub();
    const { home, dir } = setup(url);
    const sync = start(home, url, () => {});
    const nodes = (ids: string[]) => ids.map((id) => `      - { id: ${id}, type: process, label: ${id} }`).join('\n');
    const head = 'name: alpha\nlayers:\n  - id: main\n    title: Main\n    nodes:\n';
    writeFileSync(join(dir, 'alpha.tower.yaml'), head + nodes(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) + '\n');
    await sync.syncNow();
    writeFileSync(join(dir, 'alpha.tower.yaml'), head + nodes(['keep']) + '\n');
    await sync.syncNow();
    expect(sync.state()[0].warning).toBe(
      'removed nodes: main.n1, main.n2, main.n3, main.n4, main.n5 and 2 more (events naming them will show as unmapped)',
    );
  });
});

describe('addToLibrary: no duplicates', () => {
  it('refuses a tower whose folder is already listed, and a folder that holds a listed tower', () => {
    const home = mkdtempSync(join(root, 'lib-home-'));
    const project = mkdtempSync(join(root, 'project-'));
    const towerDir = join(project, 'towers');
    mkdirSync(towerDir);
    const tower = join(towerDir, 'alpha.tower.yaml');
    writeFileSync(tower, TOWER_A);

    expect(addToLibrary(home, towerDir)).toEqual({ added: true, warning: undefined });
    const again = addToLibrary(home, tower);
    expect(again.added).toBe(false);
    expect(again.via).toBe(towerDir);

    const libraryAfterFirst = readFileSync(join(home, 'config.json'), 'utf8');
    const parent = addToLibrary(home, project);
    expect(parent.added).toBe(false);
    expect(parent.via).toBe(towerDir);
    expect(readFileSync(join(home, 'config.json'), 'utf8')).toBe(libraryAfterFirst);
  });
});
