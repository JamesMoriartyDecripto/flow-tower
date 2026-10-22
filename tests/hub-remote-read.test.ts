import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { remoteReadAllowed } from '../src/server/files';
import { hubGuard, type HubOptions } from '../src/server/hub';

/**
 * Hub mode, remote reads (#286): a remote viewer reads a file only when the tower lies under `<library>/towers/`
 * and the file is one the tower references. The library is a real temp folder, so realpath decides as in production.
 */
const base = mkdtempSync(join(tmpdir(), 'flow-tower-remote-read-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

// The library holds one shared tower (under towers/m/s) and one private project right in the library folder.
// realpath needs the folder to exist, so it is created first; the test then compares resolved paths as production does.
mkdirSync(join(base, 'library'));
const library = realpathSync(join(base, 'library'));
const shared = join(library, 'towers', 'm', 's');
const privateRoot = join(library, 'private');
for (const dir of [join(shared, 'config'), privateRoot]) mkdirSync(dir, { recursive: true });
writeFileSync(join(shared, 'notes.md'), '# notes');
writeFileSync(join(shared, 'config', 'prod.json'), '{"password":"x"}');
writeFileSync(join(privateRoot, 'notes.md'), '# private');
const referenced = new Set([join(shared, 'notes.md')]);

describe('remoteReadAllowed (#286)', () => {
  it('allows only the referenced file of a shared tower', async () => {
    expect(await remoteReadAllowed(shared, 'notes.md', library, referenced)).toBe(true);
  });

  it('refuses an unreferenced file of a shared tower, even a non-secret one', async () => {
    expect(await remoteReadAllowed(shared, 'config/prod.json', library, referenced)).toBe(false);
  });

  it('refuses any file of a tower root that is not under towers/', async () => {
    expect(await remoteReadAllowed(privateRoot, 'notes.md', library, new Set([join(privateRoot, 'notes.md')]))).toBe(false);
  });

  it('refuses with no library configured', async () => {
    expect(await remoteReadAllowed(shared, 'notes.md', undefined, referenced)).toBe(false);
  });

  it('refuses a path that climbs out of the root', async () => {
    expect(await remoteReadAllowed(shared, '../private/notes.md', library, referenced)).toBe(false);
    expect(await remoteReadAllowed(shared, '../../notes.md', library, referenced)).toBe(false);
  });
});

// The guard helpers, as in tests/hub-mode.test.ts: a fake req/res, so the decision is made without a server.
type Req = { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string } };
const opts: HubOptions = { hub: true, ingestOnly: false, home: base };
// tailscale serve connects from loopback and only the header marks the viewer as remote.
const forwarded = (method: string, url: string, headers: Record<string, string> = {}): Req =>
  ({ method, url, headers: { 'x-forwarded-for': '100.64.0.9', ...headers }, socket: { remoteAddress: '127.0.0.1' } });

function run(req: Req): number {
  let status = 0;
  const res = {
    headersSent: false,
    statusCode: 0,
    setHeader() { /* the status is enough */ },
    end(this: { statusCode: number }) { status = this.statusCode; },
  } as unknown as ServerResponse;
  const next = () => { status = 200; };
  hubGuard(opts)(req as unknown as IncomingMessage, res, next);
  return status;
}

describe('hub guard: spelled-out sensitive routes stay 403 for a remote viewer (#286)', () => {
  const alice = { 'tailscale-user-login': 'alice@example.com' };
  it('refuses /api/voice however it is spelled', () => {
    for (const p of ['/API/voice', '/api//voice', '/api/voice.', '/api%2Fvoice']) {
      expect(run(forwarded('GET', p, alice)), p).toBe(403);
    }
  });
});
