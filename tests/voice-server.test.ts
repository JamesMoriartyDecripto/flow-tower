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

const post = (url: string, body: unknown, type = 'application/json', extra: Record<string, string> = { 'x-flow-tower-voice': '1' }) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': type, ...extra }, body: JSON.stringify(body) });

describe('/api/voice (#62)', () => {
  it('says whether cloud transcription is configured, never the key', async () => {
    const url = await start({ key: 'sk-or-test' });
    const body = await (await fetch(url)).json();
    expect(body).toMatchObject({ cloud: true, model: 'openai/whisper-large-v3-turbo' });
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

  it('runs an agent step and speaks the reply (#63)', async () => {
    const fetchFake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith('/chat/completions')
        ? new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Ecco.' } }], usage: { cost: 0.001 } }))
        : new Response(new Uint8Array([0x49, 0x44, 0x33]), { headers: { 'Content-Type': 'audio/mpeg' } });
    }) as unknown as typeof fetch;
    const url = await start({ key: 'sk-or-test', fetch: fetchFake, chatModel: 'google/gemini-3.1-flash-lite', ttsModel: 'elevenlabs/eleven-flash-v2.5', voice: 'alice' });
    const chat = await post(`${url}chat`, { messages: [{ role: 'user', content: 'ciao' }], tools: [], answer: true });
    expect(await chat.json()).toMatchObject({ message: { content: 'Ecco.' }, cost: 0.001 });
    expect(JSON.parse(calls.at(-1)!.init.body as string)).toMatchObject({
      model: 'google/gemini-3.1-flash-lite', tool_choice: 'none', provider: { zdr: true, require_parameters: true },
    });
    const speech = await post(`${url}speak`, { text: 'Ecco.' });
    expect(speech.headers.get('content-type')).toBe('audio/mpeg');
    expect(JSON.parse(calls.at(-1)!.init.body as string)).toMatchObject({ model: 'elevenlabs/eleven-flash-v2.5', voice: 'alice', input: 'Ecco.', response_format: 'mp3' });
    expect((await post(`${url}nope`, {})).status).toBe(404);
    expect((await post(`${url}chat`, { messages: 'x' })).status).toBe(400);
  });

  it('refuses what a web page on another site could send (CSRF)', async () => {
    const url = await start({ key: 'sk-or-test' });
    const before = calls.length;
    // CORS-safelisted: a browser sends this cross-site without a preflight.
    expect((await post(url, { audio: 'AAAA', format: 'webm' }, 'text/plain;x=application/json')).status).toBe(415);
    expect((await post(url, { audio: 'AAAA', format: 'webm' }, 'application/json', {})).status).toBe(403);
    expect((await post(url, { audio: 'AAAA', format: 'webm' }, 'application/json', { 'x-flow-tower-voice': '1', Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(url, { audio: 'AAAA', format: 'webm' }, 'application/json', { 'x-flow-tower-voice': '1', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect(calls.length).toBe(before);
  });
});
