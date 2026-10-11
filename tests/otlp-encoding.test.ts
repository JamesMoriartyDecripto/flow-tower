import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync, deflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventHub } from '../src/server/events';

const servers: ReturnType<typeof createServer>[] = [];
async function start(token?: string) {
  const hub = createEventHub(() => undefined, () => undefined, token);
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/v1/')) return hub.otlp(req.url.split('/')[2] as 'logs')!(req, res);
    return hub.handle(req, res);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, hub };
}
afterAll(() => servers.forEach((s) => s.close()));

/** The shape Claude Code sends with OTEL_EXPORTER_OTLP_PROTOCOL=http/json, as the collector gzips it. */
const claudeCode = (records: object[]) => ({
  resourceLogs: [{
    resource: { attributes: [{ key: 'service.name', value: { stringValue: 'claude-code' } }] },
    scopeLogs: [{ logRecords: records }],
  }],
});
const usage = (tokens: number) => ({
  body: { stringValue: 'claude_code.api_request' },
  attributes: [
    { key: 'event.name', value: { stringValue: 'api_request' } },
    { key: 'session.id', value: { stringValue: 'sess-1' } },
    { key: 'input_tokens', value: { intValue: String(tokens) } },
  ],
});
const post = (url: string, body: Buffer, extra: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: body as unknown as BodyInit });

describe('compressed OTLP bodies (#81)', () => {
  it('accepts a gzip-compressed logs batch and produces the same events as the plain one', async () => {
    const { url, hub } = await start();
    const json = JSON.stringify(claudeCode([usage(1200)]));
    expect((await post(`${url}/v1/logs`, Buffer.from(json))).status).toBe(200);
    expect(hub.recent()).toHaveLength(1);

    const plain = hub.recent().map((e) => ({ ...e }));
    const r = await post(`${url}/v1/logs`, gzipSync(json), { 'Content-Encoding': 'gzip' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const events = hub.recent();
    expect(events).toHaveLength(plain.length + 1);
    expect(events.at(-1)).toMatchObject({ kind: 'usage', source: 'claude-code', session: 'sess-1', tokens: 1200 });
    expect(events.at(-1)!.id).toBe(plain.at(-1)!.id + 1);
  });

  it('accepts deflate too', async () => {
    const { url } = await start();
    const r = await post(`${url}/v1/logs`, deflateSync(JSON.stringify(claudeCode([usage(10)]))), { 'Content-Encoding': 'deflate' });
    expect(r.status).toBe(200);
  });

  it('refuses a gzip bomb with 413: the cap is on the decompressed bytes', async () => {
    const { url, hub } = await start();
    // ~8 MB of zeros compress to a few KB: a small body that inflates past the 4 MB cap.
    const bomb = gzipSync(Buffer.alloc(8_000_000, 0x20));
    expect(bomb.length).toBeLessThan(4_000_000);
    const r = await post(`${url}/v1/logs`, bomb, { 'Content-Encoding': 'gzip' });
    expect(r.status).toBe(413);
    expect(hub.recent()).toHaveLength(0);
  });

  it('refuses an unknown encoding with 415', async () => {
    const { url } = await start();
    for (const enc of ['br', 'zstd']) {
      const r = await post(`${url}/v1/logs`, gzipSync('{"resourceLogs":[]}'), { 'Content-Encoding': enc });
      expect(r.status, enc).toBe(415);
      expect((await r.json()).error).toContain(enc);
    }
  });
});

describe('compressed /api/events bodies (#81)', () => {
  it('accepts gzip and still answers 204 with an empty body', async () => {
    const { url, hub } = await start();
    const r = await post(`${url}/api/events`, gzipSync(JSON.stringify({ kind: 'log', message: 'hi' })), { 'Content-Encoding': 'gzip' });
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
    expect(hub.recent().at(-1)).toMatchObject({ kind: 'log', message: 'hi' });
  });

  it('refuses a gzip bomb with 413 and an unknown encoding with 415', async () => {
    const { url, hub } = await start();
    expect((await post(`${url}/api/events`, gzipSync(Buffer.alloc(4_000_000, 0x20)), { 'Content-Encoding': 'gzip' })).status).toBe(413);
    expect((await post(`${url}/api/events`, gzipSync('{}'), { 'Content-Encoding': 'br' })).status).toBe(415);
    expect(hub.recent()).toHaveLength(0);
  });
});
