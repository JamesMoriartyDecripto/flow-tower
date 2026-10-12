import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sharedTowersHandler } from '../src/server/shared-towers';
import { tokenStore } from '../src/server/tokens';

/**
 * Shared towers (#164): a satellite uploads its folder to the hub, signed with its own token. These tests run
 * the real handler on a real socket, so the body streaming, the status codes and the filesystem all count.
 */
const library = mkdtempSync(join(tmpdir(), 'flow-tower-lib-'));
const home = mkdtempSync(join(tmpdir(), 'flow-tower-shared-home-'));
const { token: boxToken } = tokenStore(home).create('box-1');
const { token: otherToken } = tokenStore(home).create('box-2');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer(sharedTowersHandler({ library, home, hub: true }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const TOWER = 'name: demo\nlayers: []\n';
const files = (extra: { path: string; content: string }[] = []) => [{ path: 'demo.tower.yaml', content: TOWER }, ...extra];

const put = (name: string, body: unknown, token = boxToken, type = 'application/json') =>
  fetch(`${base}${name}`, {
    method: 'PUT',
    headers: { 'content-type': type, ...(token ? { 'x-flow-tower-token': token } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const del = (name: string, token = boxToken) =>
  fetch(`${base}${name}`, { method: 'DELETE', headers: token ? { 'x-flow-tower-token': token } : {} });
const list = (token = boxToken) =>
  fetch(base, { headers: token ? { 'x-flow-tower-token': token } : {} });

describe('shared towers (#164)', () => {
  it('PUT writes the folder under towers/<sender>/<name> with nested files', async () => {
    const res = await put('demo', { files: files([{ path: 'notes/readme.md', content: 'hi' }]) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ name: 'demo', files: 2, bytes: Buffer.byteLength(TOWER) + 2 });
    const dir = join(library, 'towers', 'box-1', 'demo');
    expect(readFileSync(join(dir, 'demo.tower.yaml'), 'utf8')).toBe(TOWER);
    expect(readFileSync(join(dir, 'notes', 'readme.md'), 'utf8')).toBe('hi');
  });

  it('a second PUT replaces the folder, so an old file is gone and no staging is left', async () => {
    await put('demo', { files: files([{ path: 'old.md', content: 'x' }]) });
    const res = await put('demo', { files: files() });
    expect(res.status).toBe(200);
    expect(existsSync(join(library, 'towers', 'box-1', 'demo', 'old.md'))).toBe(false);
    expect(readdirSync(join(library, 'towers', '.staging'))).toEqual([]);
  });

  it('GET lists the sender folders, and an unknown sender has none', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sender: 'box-1', towers: ['demo'] });
    expect(await (await list(otherToken)).json()).toEqual({ sender: 'box-2', towers: [] });
  });

  it('DELETE removes the folder and says whether it was there', async () => {
    expect(await (await del('demo')).json()).toEqual({ name: 'demo', removed: true });
    expect(existsSync(join(library, 'towers', 'box-1', 'demo'))).toBe(false);
    expect(await (await del('demo')).json()).toEqual({ name: 'demo', removed: false });
  });

  it('refuses a request with no token (401), and writes nothing', async () => {
    // '' means "send no token": undefined would fall back to the default parameter (boxToken).
    expect((await put('demo', { files: files() }, '')).status).toBe(401);
    expect((await del('demo', '')).status).toBe(401);
    expect((await list('')).status).toBe(401);
    expect(existsSync(join(library, 'towers', 'box-1', 'demo'))).toBe(false);
  });

  it('refuses a path with ".." (400) and writes nothing outside the folder', async () => {
    const res = await put('demo', { files: files([{ path: '../../escape.md', content: 'x' }]) });
    expect(res.status).toBe(400);
    expect(existsSync(join(library, 'towers', 'escape.md'))).toBe(false);
    expect(existsSync(join(library, 'escape.md'))).toBe(false);
    expect((await put('..%2fevil', { files: files() })).status).toBe(400);
  });

  it('refuses a revoked token (401)', async () => {
    const { token } = tokenStore(home).create('box-3');
    expect((await put('demo', { files: files() }, token)).status).toBe(200);
    tokenStore(home).revoke('box-3');
    expect((await put('demo', { files: files() }, token)).status).toBe(401);
    expect((await list(token)).status).toBe(401);
  });

  it('keeps two senders apart: each only sees and removes its own folder', async () => {
    await put('demo', { files: files() }, boxToken);
    await put('demo', { files: files() }, otherToken);
    expect(await (await del('demo', boxToken)).json()).toEqual({ name: 'demo', removed: true });
    expect(existsSync(join(library, 'towers', 'box-2', 'demo', 'demo.tower.yaml'))).toBe(true);
    expect(await (await list(boxToken)).json()).toEqual({ sender: 'box-1', towers: [] });
    await del('demo', otherToken);
  });

  it('answers 415 for a body that is not JSON, and 404 for a route it does not know', async () => {
    expect((await put('demo', 'x', boxToken, 'text/plain')).status).toBe(415);
    const res = await fetch(`${base}a/b/c`, { method: 'PUT', headers: { 'x-flow-tower-token': boxToken } });
    expect(res.status).toBe(404);
    const post = await fetch(base, { method: 'POST', headers: { 'x-flow-tower-token': boxToken } });
    expect(post.status).toBe(405);
  });
});
