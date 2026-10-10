import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { readTowerFile } from '../src/server/files';
import { crossSite, isJson } from '../src/server/guard';

const req = (headers: Record<string, string>) => ({ headers: { host: '127.0.0.1:5317', ...headers } }) as unknown as IncomingMessage;

describe('server guards (security review of #62)', () => {
  it('reads the content type by its exact essence', () => {
    expect(isJson(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
    expect(isJson(req({ 'content-type': 'text/plain;x=application/json' }))).toBe(false);
  });

  it('tells browser requests from other sites apart from local tools', () => {
    expect(crossSite(req({}))).toBe(false); // curl, hooks, OTLP exporters
    expect(crossSite(req({ origin: 'http://127.0.0.1:5317', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(crossSite(req({ origin: 'http://localhost:3000' }))).toBe(true);
    expect(crossSite(req({ 'sec-fetch-site': 'same-site' }))).toBe(true);
  });

  it('never serves secret files, even inside a tower root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-tower-'));
    for (const f of ['.env', '.env.local', 'id_rsa', 'server.key', 'notes.md']) writeFileSync(join(dir, f), 'x');
    for (const f of ['.env', '.env.local', 'id_rsa', 'server.key', './.env', 'sub/../.env']) {
      expect((await readTowerFile(dir, f)).status, f).toBe(403);
    }
    expect((await readTowerFile(dir, 'notes.md')).status).toBe(200);
  });
});
