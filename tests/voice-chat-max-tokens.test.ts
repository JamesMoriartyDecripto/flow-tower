import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { voiceHandler } from '../src/server/voice';

const upstreamBodies: Record<string, unknown>[] = [];
const fakeFetch = (async (_url: string, init: RequestInit) => {
  upstreamBodies.push(JSON.parse(init.body as string));
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Ecco.' } }], usage: { cost: 0.001 } }));
}) as unknown as typeof fetch;

const servers: ReturnType<typeof createServer>[] = [];
async function start() {
  const server = createServer(voiceHandler({ model: 'openai/whisper-large-v3-turbo', zdr: true, key: 'sk-or-test', fetch: fakeFetch }));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/chat`;
}
afterAll(() => servers.forEach((s) => s.close()));

const chat = (url: string, extra: Record<string, unknown>) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-flow-tower-voice': '1' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'riassumi' }], tools: [], ...extra }),
});

describe('/api/voice/chat max_tokens (#275)', () => {
  it('keeps 500 when the caller does not send max_tokens', async () => {
    const url = await start();
    expect((await chat(url, {})).status).toBe(200);
    expect(upstreamBodies.at(-1)).toMatchObject({ max_tokens: 500 });
  });

  it('passes an allowed max_tokens (the tour narrates with 1200) upstream', async () => {
    const url = await start();
    expect((await chat(url, { max_tokens: 1200 })).status).toBe(200);
    expect(upstreamBodies.at(-1)).toMatchObject({ max_tokens: 1200 });
  });

  it('refuses a max_tokens outside 1 to 1200, or not a whole number, with 400 and no upstream call', async () => {
    const url = await start();
    const before = upstreamBodies.length;
    for (const bad of [0, 5000, 'x', 1.5, null]) {
      expect((await chat(url, { max_tokens: bad })).status).toBe(400);
    }
    expect(upstreamBodies.length).toBe(before);
  });
});
