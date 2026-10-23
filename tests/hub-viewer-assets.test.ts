import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { isViewerRequest } from '../src/server/viewer-assets';
import { hubGuard, type HubOptions } from '../src/server/hub';

/**
 * Hub mode (#287): a remote viewer may load the app and nothing else. The tables are the requests the app
 * really makes (measured on the 3D and document pages) and the reads the guard must refuse.
 */
describe('isViewerRequest: what a remote viewer may load', () => {
  it.each([
    ['/'],
    ['/?tower=team-hub'],
    ['/?doc=team-hub&snap=0'],
    ['/index.html'],
    ['/@vite/client'],
    ['/@vite/env'],
    ['/@react-refresh'],
    ['/src/app/main.tsx'],
    ['/src/app/hud/Hud.tsx?t=1700000000000'],
    ['/src/app/hud/hud.css?direct&t=1'],
    ['/src/core/schema.ts'],
    ['/node_modules/.vite/port-5317/deps/react.js?v=bb39b553'],
    ['/node_modules/vite/dist/client/env.mjs'],
    ['/node_modules/@fontsource/orbitron/600.css'],
    ['/node_modules/@fontsource/orbitron/files/orbitron-latin-600-normal.woff2'],
    ['/node_modules/@fontsource/orbitron/files/orbitron-latin-600-normal.woff?import&url'],
    ['/node_modules/katex/dist/katex.min.css'],
    ['/package.json?import'],
    ['/api/workspace'],
    ['/api/file?path=a/b.md&tower=x'],
    ['/API/workspace'],
  ])('allows %s', (url) => {
    expect(isViewerRequest(url)).toBe(true);
  });

  it.each([
    ['/package.json'],
    ['/package.json?raw'],
    ['/package.json?import&raw'],
    ['/NEXT.md'],
    ['/flow-tower.local.json'],
    ['/src/server/hub.ts'],
    ['/src/server/hub.ts?raw'],
    ['/SRC/server/hub.ts'],
    ['/src/app/main.tsx?raw'],
    ['/src/app/main.tsx?import&raw'],
    ['/src/core/schema.ts?url'],
    ['/src/app/main.tsx?worker_file&type=module'],
    ['/src/app/main.tsx%3fraw'],
    ['/node_modules/.vite/../../package.json'],
    ['/node_modules/.vite/..%2f..%2fpackage.json'],
    ['/src/app/%2e%2e/server/hub.ts'],
    ['/src/app/./main.tsx'],
    ['/src/app/..\\server\\hub.ts'],
    ['/src//app/main.tsx'],
    ['/api/../package.json'],
    ['/api/..%2fpackage.json'],
    ['/src/app/%E0%A4%A'],
    ['/node_modules/three/package.json'],
    ['/node_modules/three/build/three.module.js'],
    ['/node_modules/@fontsource/orbitron/600.css?raw'],
    ['/@id/three'],
    ['/@fs/etc/passwd'],
    ['/examples/team-hub/team-hub.tower.yaml'],
    ['/tests/hub-mode.test.ts'],
    [''],
    ['src/app/main.tsx'],
  ])('refuses %s', (url) => {
    expect(isViewerRequest(url)).toBe(false);
  });
});

/**
 * Windows drops trailing dots and spaces from a file name, so a segment ending in one must not pass the guard.
 */
describe('isViewerRequest: a segment ending in a dot or a space', () => {
  it.each([
    ['/src/app/main.tsx.'],
    ['/src/app/main.tsx%20'],
    ['/src/app/.../main.tsx'],
    ['/src/app./main.tsx'],
    ['/package.json.?import'],
    ['/node_modules/.vite/port-5317/deps/react.js.?v=1'],
  ])('refuses %s', (url) => {
    expect(isViewerRequest(url)).toBe(false);
  });

  it('still allows a segment that starts with a dot', () => {
    expect(isViewerRequest('/node_modules/.vite/port-5317/deps/react.js?v=1')).toBe(true);
  });
});

/**
 * Hub mode (#287): the guard lets a listed viewer through only for the app's own assets and the read routes.
 * Same fake req/res as hub-mode.test.ts: no server, no route unless the guard passes the request.
 */
type Req = { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string } };

const forwarded = (method: string, url: string, headers: Record<string, string> = {}) => ({ method, url, headers: { 'x-forwarded-for': '100.64.0.9', ...headers }, socket: { remoteAddress: '127.0.0.1' } });

function run(opts: HubOptions, req: Req) {
  const sent = { status: 0, body: '' };
  const res = {
    headersSent: false,
    statusCode: 0,
    setHeader() { /* recorded status/body are enough */ },
    end(this: { headersSent: boolean; statusCode: number }, body?: string) {
      this.headersSent = true;
      sent.status = this.statusCode;
      sent.body = body ?? '';
    },
  } as unknown as ServerResponse;
  const next = () => { sent.status = 200; };
  hubGuard(opts)(req as unknown as IncomingMessage, res, next);
  return sent;
}

const viewerHome = mkdtempSync(join(tmpdir(), 'flow-tower-viewer-'));
writeFileSync(join(viewerHome, 'hub.json'), JSON.stringify({ viewers: ['alice@example.com'] }));
const opts: HubOptions = { hub: true, ingestOnly: false, home: viewerHome };
const alice = { 'tailscale-user-login': 'alice@example.com' };

describe('hubGuard, remote viewer (#287)', () => {
  it.each([
    ['/'],
    ['/?tower=team-hub'],
    ['/src/app/main.tsx'],
    ['/node_modules/.vite/port-5317/deps/react.js?v=1'],
    ['/api/workspace'],
  ])('lets a viewer load %s', (url) => {
    expect(run(opts, forwarded('GET', url, alice)).status).toBe(200);
  });

  it('answers a viewer asking for a file outside the app with a 403 naming the rule', () => {
    const sent = run(opts, forwarded('GET', '/NEXT.md', alice));
    expect(sent.status).toBe(403);
    expect(JSON.parse(sent.body).error).toBe('a remote viewer may load only the app and its API');
  });

  it.each([
    ['GET', '/src/server/hub.ts?raw'],
    ['GET', '/node_modules/.vite/../../package.json'],
    ['HEAD', '/package.json'],
    ['GET', '/api/..%2fpackage.json'],
    ['GET', '/@fs/etc/passwd'],
  ])('refuses a viewer %s %s', (method, url) => {
    expect(run(opts, forwarded(method, url, alice)).status).toBe(403);
  });

  it('still refuses a stranger on the app itself', () => {
    const sent = run(opts, forwarded('GET', '/src/app/main.tsx', { 'tailscale-user-login': 'mallory@example.com' }));
    expect(sent.status).toBe(403);
    expect(JSON.parse(sent.body).error.startsWith('remote viewing is not allowed')).toBe(true);
  });

  it('leaves the machine\'s own browser unchanged', () => {
    const local: Req = { method: 'GET', url: '/NEXT.md', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    expect(run(opts, local).status).toBe(200);
  });

  it('keeps the checkout config out of the Vite file server', async () => {
    const config = (await import('../vite.config.ts')).default;
    expect(config.server?.fs?.deny).toContain('flow-tower.local.json');
  });
});
