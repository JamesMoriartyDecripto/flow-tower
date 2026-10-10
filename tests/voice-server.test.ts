import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { OPENROUTER_STT, voiceHandler, type VoiceConfig } from '../src/server/voice';

const calls: { url: string; init: RequestInit }[] = [];
const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ text: ' apri la dev squad ', usage: { cost: 0.0001 } }), { status: 200 });
}) as unknown as typeof fetch;

const servers: ReturnType<typeof createServer>[] = [];
async function start(cfg: Partial<VoiceConfig>) {
  const server = createServer(voiceHandler({ model: 'openai/whisper-large-v3-turbo', zdr: true, fetch: fakeFetch, ...cfg }));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}
afterAll(() => servers.forEach((s) => s.close()));

const post = (url: string, body: unknown, type = 'application/json') =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });

describe('/api/voice (#62)', () => {
  it('says whether cloud transcription is configured, never the key', async () => {
    const url = await start({ key: 'sk-or-test' });
    const body = await (await fetch(url)).json();
    expect(body).toEqual({ cloud: true, model: 'openai/whisper-large-v3-turbo' });
    expect(JSON.stringify(body)).not.toContain('sk-or');
  });

  it('forwards the audio to OpenRouter with the key, zero data retention and the language', async () => {
    const url = await start({ key: 'sk-or-test' });
    const r = await post(url, { audio: 'AAAA', format: 'webm', language: 'it' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ text: 'apri la dev squad', cost: 0.0001 });
    const sent = calls.at(-1)!;
    expect(sent.url).toBe(OPENROUTER_STT);
    expect((sent.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    expect(JSON.parse(sent.init.body as string)).toEqual({
      model: 'openai/whisper-large-v3-turbo', input_audio: { data: 'AAAA', format: 'webm' }, language: 'it', provider: { zdr: true },
    });
  });

  it('refuses without a key, without JSON, or with an unknown format', async () => {
    expect((await post(await start({}), { audio: 'AAAA', format: 'webm' })).status).toBe(503);
    const url = await start({ key: 'sk-or-test' });
    expect((await post(url, { audio: 'AAAA', format: 'webm' }, 'text/plain')).status).toBe(415);
    expect((await post(url, { audio: 'AAAA', format: 'exe' })).status).toBe(400);
  });
});
