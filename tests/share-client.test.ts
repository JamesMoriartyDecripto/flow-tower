import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectTower, fingerprint, listShared, removeTower, shareName, uploadTower } from '../src/server/share-client';

/**
 * The satellite side of sharing (#164). Collection runs on real temp folders; the HTTP helpers run against a
 * stub server on 127.0.0.1, so the header, the status and the timeout path are the real ones.
 */
const folders: string[] = [];
const folder = (name: string) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'flow-tower-share-')), name);
  mkdirSync(dir, { recursive: true });
  folders.push(dir);
  return dir;
};
const write = (path: string, content: string) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
};

// A prompt `file:` is read by the loader, so it lands in `watched` and is eligible to be shared.
const TOWER_WITH_DOC = [
  'name: demo',
  'prompts:',
  '  intake:',
  '    file: docs/a.md',
  'agents:',
  '  intake:',
  '    prompt: intake',
  'layers:',
  '  - id: main',
  '    title: Main',
  '    nodes:',
  '      - { id: start, type: entry, label: Start, agent: intake }',
  '',
].join('\n');

describe('collectTower', () => {
  it('YAML only: sends the tower files and nothing else beside them', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), 'name: demo\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n');
    write(join(dir, 'notes.md'), '# private notes');
    const r = await collectTower(dir, { withFiles: false });
    expect(r).toEqual({ files: [{ path: 'demo.tower.yaml', content: 'name: demo\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n' }], skipped: [] });
  });

  it('with files: adds the referenced file that the tower reads', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), TOWER_WITH_DOC);
    write(join(dir, 'docs/a.md'), 'hello');
    const r = await collectTower(dir, { withFiles: true });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.files.map((f) => f.path).sort()).toEqual(['demo.tower.yaml', 'docs/a.md']);
    expect(r.files.find((f) => f.path === 'docs/a.md')?.content).toBe('hello');
  });

  it('with files: sends a node files entry, which the loader only checks, and never the .env beside it', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), [
      'name: demo',
      'layers:',
      '  - id: main',
      '    title: Main',
      '    nodes:',
      '      - { id: start, type: entry, label: Start, files: [docs/a.md] }',
      '',
    ].join('\n'));
    write(join(dir, 'docs/a.md'), 'hello');
    write(join(dir, '.env'), 'API_KEY=secret');
    const r = await collectTower(dir, { withFiles: true });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.files.map((f) => f.path).sort()).toEqual(['demo.tower.yaml', 'docs/a.md']);
    expect(JSON.stringify(r)).not.toContain('API_KEY');
  });

  it('YAML only: a node files entry is not sent', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), TOWER_WITH_DOC.replace('agent: intake }', 'agent: intake, files: [docs/a.md] }'));
    write(join(dir, 'docs/a.md'), 'hello');
    const r = await collectTower(dir, { withFiles: false });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.files.map((f) => f.path)).toEqual(['demo.tower.yaml']);
  });

  it('with files: skips a referenced file that lies outside the folder', async () => {
    const parent = folder('outer');
    const dir = join(parent, 'inner');
    mkdirSync(dir, { recursive: true });
    // The project is the git repo above the folder, so the loader reads `../secret-plan.md` and records it in
    // `watched`. Only collectTower's own folder check keeps it out, which is the case under test.
    mkdirSync(join(parent, '.git'));
    write(join(parent, 'secret-plan.md'), 'outside');
    write(join(dir, 'demo.tower.yaml'), TOWER_WITH_DOC.replace('docs/a.md', '../secret-plan.md'));
    const r = await collectTower(dir, { withFiles: true });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.files.map((f) => f.path)).toEqual(['demo.tower.yaml']);
    expect(r.skipped).toEqual([expect.objectContaining({ reason: 'outside the tower folder' })]);
  });

  it('with files: skips a symlink whose target lies outside the folder, and never reads it', async () => {
    const parent = folder('outer');
    const dir = join(parent, 'inner');
    mkdirSync(dir, { recursive: true });
    // As in the test above: the project is the repo above the folder, so the loader accepts the link by its
    // target and records it in `referenced`. Only the real-path check in collectTower keeps it out.
    mkdirSync(join(parent, '.git'));
    write(join(parent, 'private', 'x.md'), 'SECRET-OUTSIDE');
    write(join(dir, 'demo.tower.yaml'), TOWER_WITH_DOC);
    mkdirSync(join(dir, 'docs'), { recursive: true });
    symlinkSync(join(parent, 'private', 'x.md'), join(dir, 'docs', 'a.md'));
    const r = await collectTower(dir, { withFiles: true });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.files.map((f) => f.path)).toEqual(['demo.tower.yaml']);
    expect(r.skipped).toEqual([{ path: 'docs/a.md', reason: 'symlink leaves the tower folder' }]);
    expect(JSON.stringify(r)).not.toContain('SECRET-OUTSIDE');
  });

  it('with files: still sends a symlink whose target lies inside the folder', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), TOWER_WITH_DOC);
    write(join(dir, 'data', 'real.md'), 'inside');
    mkdirSync(join(dir, 'docs'), { recursive: true });
    symlinkSync(join(dir, 'data', 'real.md'), join(dir, 'docs', 'a.md'));
    const r = await collectTower(dir, { withFiles: true });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.files.find((f) => f.path === 'docs/a.md')?.content).toBe('inside');
    expect(r.skipped).toEqual([]);
  });

  it('a folder without a tower file is an error', async () => {
    const dir = folder('empty');
    write(join(dir, 'readme.md'), 'no tower here');
    expect(await collectTower(dir, { withFiles: false })).toEqual({ error: `no *.tower.yaml in ${dir}` });
  });

  it('a path that is not a folder is an error', async () => {
    const dir = folder('x');
    const missing = join(dir, 'nope');
    expect(await collectTower(missing, { withFiles: false })).toEqual({ error: `not a folder: ${missing}` });
  });

  // Mode 000 only denies a non-root user, so the test is skipped where it cannot hold (Windows, root).
  const canDeny = process.platform !== 'win32' && process.getuid?.() !== 0;
  it.skipIf(!canDeny)('a tower file that cannot be read is an error, not a throw', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), 'name: demo\nlayers:\n  - id: main\n    title: Main\n    nodes:\n      - { id: start, type: entry, label: Start }\n');
    const locked = join(dir, 'locked.tower.yaml');
    write(locked, 'name: locked\n');
    chmodSync(locked, 0o000);
    try {
      expect(await collectTower(dir, { withFiles: false })).toEqual({ error: 'cannot read locked.tower.yaml: EACCES' });
    } finally {
      chmodSync(locked, 0o600);
    }
  });

  it('never sends .env beside the tower, in either mode', async () => {
    const dir = folder('demo');
    write(join(dir, 'demo.tower.yaml'), TOWER_WITH_DOC);
    write(join(dir, 'docs/a.md'), 'hello');
    write(join(dir, '.env'), 'API_KEY=secret');
    write(join(dir, 'config/.env'), 'API_KEY=secret');
    for (const withFiles of [false, true]) {
      const r = await collectTower(dir, { withFiles });
      expect('error' in r).toBe(false);
      if ('error' in r) continue;
      expect(JSON.stringify(r)).not.toContain('API_KEY');
      expect(r.files.some((f) => f.path.endsWith('.env'))).toBe(false);
    }
  });
});

describe('shareName', () => {
  it('slugs the folder base name', () => {
    expect(shareName('/home/me/My Tower_Demo!')).toBe('my-tower-demo');
    expect(shareName('/x/__Hello__')).toBe('hello');
  });

  it('falls back to "tower" when nothing is left', () => {
    expect(shareName('/x/!!!')).toBe('tower');
  });

  it('is cut to 64 characters and never ends in a dash', () => {
    const name = shareName(`/x/${'a'.repeat(63)}-b`);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name.endsWith('-')).toBe(false);
  });
});

describe('fingerprint', () => {
  it('changes when one file changes', () => {
    const a = [{ path: 'a.tower.yaml', content: '1' }, { path: 'b.md', content: '2' }];
    const b = [{ path: 'a.tower.yaml', content: '1' }, { path: 'b.md', content: '3' }];
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('does not change when only the order changes', () => {
    const a = [{ path: 'a.tower.yaml', content: '1' }, { path: 'b.md', content: '2' }];
    const b = [{ path: 'b.md', content: '2' }, { path: 'a.tower.yaml', content: '1' }];
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe('hub helpers', () => {
  const TOKEN = 'tok-secret-123';
  const seen: { method?: string; url?: string; token?: string; body?: string }[] = [];
  let server: Server;
  let hub = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, token: req.headers['x-flow-tower-token'] as string, body });
        res.setHeader('Content-Type', 'application/json');
        if (req.headers['x-flow-tower-token'] !== TOKEN) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'a sender token is required' }));
          return;
        }
        if (req.method === 'PUT') { res.end(JSON.stringify({ name: 'demo', files: 1, bytes: 5 })); return; }
        if (req.method === 'DELETE') { res.end(JSON.stringify({ name: 'demo', removed: true })); return; }
        res.end(JSON.stringify({ sender: 'box-1', towers: ['demo'] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    hub = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const files = [{ path: 'demo.tower.yaml', content: 'name: demo\n' }];

  it('uploads with the token in x-flow-tower-token and reports the stored counts', async () => {
    const r = await uploadTower(hub, TOKEN, 'demo', files);
    expect(r).toEqual({ ok: true, files: 1, bytes: 5 });
    const last = seen.at(-1)!;
    expect(last.method).toBe('PUT');
    expect(last.url).toBe('/api/hub/towers/demo');
    expect(last.token).toBe(TOKEN);
    expect(JSON.parse(last.body!)).toEqual({ files });
  });

  it('removes a shared folder by name', async () => {
    expect(await removeTower(hub, TOKEN, 'demo')).toEqual({ ok: true });
    expect(seen.at(-1)?.method).toBe('DELETE');
  });

  it('lists the shared folders', async () => {
    expect(await listShared(hub, TOKEN)).toEqual({ ok: true, towers: ['demo'] });
  });

  it('a 401 becomes { ok: false, status: 401 } and keeps the token out of the message', async () => {
    const r = await uploadTower(hub, 'wrong-token', 'demo', files);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(401);
    expect(r.error).toBe('a sender token is required');
    expect(JSON.stringify(r)).not.toContain('wrong-token');
  });

  it('an unreachable port becomes status 0 with a message', async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const r = await listShared(`http://127.0.0.1:${port}`, TOKEN);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(0);
    expect(typeof r.error).toBe('string');
    expect(r.error).not.toContain(TOKEN);
  });
});

afterAll(() => {
  for (const dir of folders) rmSync(join(dir, '..'), { recursive: true, force: true });
});
