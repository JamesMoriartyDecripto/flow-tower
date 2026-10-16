import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENDPOINT_CALLS as CALLS } from '../examples/model-benchmark/scripts/endpoints.mjs';
// endpoints-media.mjs has no declaration file (only the endpoints.d.mts types are in scope), so TypeScript
// cannot infer pickVoice's signature; the call sites below pass plain strings and arrays, which is all it needs.
// @ts-expect-error untyped .mjs module
import { fitVideo, pcmToWav, pickVoice } from '../examples/model-benchmark/scripts/endpoints-media.mjs';

// endpoints.d.mts only types the step-03 context and result. The media fields are cast here, so the
// declaration file stays untouched by this step.
type MediaCtx = { key: string; fetchImpl: unknown; outDir?: string; run?: number; pollMs?: number; videoWaitMs?: number; timeoutMs?: number; voices?: Record<string, string[]>; videoModels?: Record<string, unknown> };
type MediaResult = { answer: string | null; artifact?: string | null; voice?: string | null; cost: number | null; firstOutputMs: number | null; totalMs: number; error: string | null; raw?: unknown };
type MediaCall = (ctx: MediaCtx, model: string, task: Record<string, unknown>) => Promise<MediaResult>;
const ENDPOINT_CALLS = CALLS as unknown as Record<'images' | 'videos' | 'speech' | 'transcriptions', MediaCall>;

type Reply = { status?: number; json?: unknown; bytes?: Uint8Array; headers?: Record<string, string> };
type Call = { method: string; url: string; body: Record<string, unknown> | undefined; headers: Record<string, string> };

/**
 * A stub fetch that answers requests in order: each entry is the reply for the next call. The last entry repeats,
 * so a poll that stays pending can be modelled with one entry. Every call is recorded for the assertions.
 */
function stub(replies: Reply[]) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = async (url: string, init: { method: string; body?: string; headers: Record<string, string> }) => {
    calls.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const reply = replies[Math.min(i++, replies.length - 1)];
    const status = reply.status ?? 200;
    const bytes = reply.bytes ?? new TextEncoder().encode(JSON.stringify(reply.json ?? {}));
    return {
      ok: status < 400,
      status,
      json: async () => reply.json,
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      headers: { get: (k: string) => reply.headers?.[k.toLowerCase()] ?? null },
    };
  };
  return { calls, fetchImpl };
}

// A 1x1 transparent PNG, as base64: small enough to inline, and it really is a PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bench-media-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// A task as loadTask would build it. `file` is absent, so the front matter reads as empty unless a test sets it.
const task = (over: Record<string, unknown> = {}) => ({ id: 'poster', endpoint: 'images', prompt: 'a red fox', dir, audio: '', ...over });

describe('media: images', () => {
  it('writes the first image under artifacts/ and returns its path as the answer', async () => {
    const { calls, fetchImpl } = stub([{ json: { data: [{ b64_json: PNG_B64, media_type: 'image/png' }], usage: { cost: 0.04 } } }]);
    const r = await ENDPOINT_CALLS.images({ key: 'k', fetchImpl, outDir: dir, run: 1 }, 'a/x', task());
    expect(r.error).toBeNull();
    expect(r.answer).toBe('artifacts/poster-a__x-run1.png');
    expect(r.artifact).toBe(r.answer);
    expect(r.cost).toBe(0.04);
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/images');
    expect(calls[0].body).toEqual({ model: 'a/x', prompt: 'a red fox' });
    const saved = readFileSync(join(dir, 'artifacts/poster-a__x-run1.png'));
    expect(saved.subarray(0, 4).toString('latin1')).toBe('\x89PNG');
  });
});

describe('media: videos', () => {
  it('submits, polls until completed, downloads the unsigned URL without the key and saves an mp4', async () => {
    const { calls, fetchImpl } = stub([
      { status: 202, json: { id: 'vid_1', polling_url: 'x', status: 'pending' } },
      { json: { id: 'vid_1', status: 'pending' } },
      { json: { id: 'vid_1', status: 'completed', unsigned_urls: ['https://cdn.example/v.mp4'], usage: { cost: 0.5 } } },
      { bytes: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]) },
    ]);
    const r = await ENDPOINT_CALLS.videos(
      // videoModels stands in for the /videos/models fetch, which would otherwise take a reply from this stub.
      { key: 'k', fetchImpl, outDir: dir, run: 2, pollMs: 1, videoWaitMs: 5000, videoModels: {} },
      'v/model', task({ endpoint: 'videos', id: 'clip' }),
    );
    expect(r.error).toBeNull();
    expect(r.answer).toBe('artifacts/clip-v__model-run2.mp4');
    expect(r.cost).toBe(0.5);
    expect(r.firstOutputMs).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://openrouter.ai/api/v1/videos',
      'GET https://openrouter.ai/api/v1/videos/vid_1',
      'GET https://openrouter.ai/api/v1/videos/vid_1',
      'GET https://cdn.example/v.mp4',
    ]);
    expect(calls[3].headers.Authorization).toBeUndefined();
    expect(existsSync(join(dir, 'artifacts/clip-v__model-run2.mp4'))).toBe(true);
  });

  it('reports "video not ready" when the job stays pending past the wait', async () => {
    const { fetchImpl } = stub([
      { status: 202, json: { id: 'vid_2', status: 'pending' } },
      { json: { id: 'vid_2', status: 'pending' } },
    ]);
    const r = await ENDPOINT_CALLS.videos(
      { key: 'k', fetchImpl, outDir: dir, run: 1, pollMs: 1, videoWaitMs: 5 },
      'v/model', task({ endpoint: 'videos' }),
    );
    expect(r.answer).toBeNull();
    expect(r.error).toMatch(/^video not ready after/);
  });
});

describe('media: speech', () => {
  it('writes the bytes as mp3 and records cost null when the header is absent', async () => {
    const { calls, fetchImpl } = stub([{ bytes: new Uint8Array([255, 251, 144, 0]) }]);
    const r = await ENDPOINT_CALLS.speech({ key: 'k', fetchImpl, outDir: dir, run: 1, voices: { 's/voice': [] } }, 's/voice', task({ endpoint: 'speech', id: 'read' }));
    expect(r.error).toBeNull();
    expect(r.answer).toBe('artifacts/read-s__voice-run1.mp3');
    expect(r.cost).toBeNull();
    expect(calls[0].body).toEqual({ model: 's/voice', input: 'a red fox', response_format: 'mp3' });
    expect([...readFileSync(join(dir, 'artifacts/read-s__voice-run1.mp3'))]).toEqual([255, 251, 144, 0]);
  });
});

describe('media: speech in pcm', () => {
  it('wraps 4 bytes of 24 kHz mono pcm in a 44-byte WAV header', () => {
    const wav = pcmToWav(Buffer.from([1, 2, 3, 4]), 24000, 1);
    expect(wav.length).toBe(48);
    expect(wav.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('latin1')).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([1, 2, 3, 4]);
  });

  it('retries once in pcm after the 400 and saves the answer as a wav', async () => {
    const refusal = { status: 400, bytes: new TextEncoder().encode('Gemini TTS only supports response_format="pcm". Got "mp3".') };
    const { calls, fetchImpl } = stub([
      refusal,
      { bytes: new Uint8Array([0, 0, 1, 0]), headers: { 'content-type': 'audio/pcm;rate=24000;channels=1' } },
    ]);
    const r = await ENDPOINT_CALLS.speech(
      { key: 'k', fetchImpl, outDir: dir, run: 1, voices: { 'g/tts': ['Kore'] } }, 'g/tts', task({ endpoint: 'speech', id: 'pcm' }),
    );
    expect(r.error).toBeNull();
    expect(r.answer).toBe('artifacts/pcm-g__tts-run1.wav');
    expect(r.voice).toBe('Kore');
    expect(calls.map((c) => c.body?.response_format)).toEqual(['mp3', 'pcm']);
    const saved = readFileSync(join(dir, 'artifacts/pcm-g__tts-run1.wav'));
    expect(saved.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(saved.length).toBe(48);
  });
});

describe('media: transcriptions', () => {
  it('sends the audio as plain base64 with its format and returns the text as the answer', async () => {
    const audio = join(dir, 'clip.wav');
    writeFileSync(audio, Buffer.from([82, 73, 70, 70]));
    const { calls, fetchImpl } = stub([{ json: { text: 'hello there', usage: { cost: 0.001 } } }]);
    const r = await ENDPOINT_CALLS.transcriptions(
      { key: 'k', fetchImpl, outDir: dir, run: 1 },
      't/x', task({ endpoint: 'transcriptions', audio: 'clip.wav', prompt: '' }),
    );
    expect(r.error).toBeNull();
    expect(r.answer).toBe('hello there');
    expect(r.cost).toBe(0.001);
    const body = calls[0].body as { input_audio: { data: string; format: string } };
    expect(body.input_audio.format).toBe('wav');
    expect(body.input_audio.data).toBe(Buffer.from([82, 73, 70, 70]).toString('base64'));
    expect(body.input_audio.data.startsWith('data:')).toBe(false);
  });
});

describe('media: pickVoice', () => {
  it('returns undefined for an empty or missing list', () => {
    expect(pickVoice([], 'it')).toBeUndefined();
    expect(pickVoice(undefined, 'it')).toBeUndefined();
  });

  it('prefers a voice tagged with the language for Microsoft-style ids', () => {
    const voices = ['it-IT-Isabella:MAI-Voice-2.1-Flash', 'en-US-Harper:MAI-Voice-2.1-Flash'];
    expect(pickVoice(voices, 'it')).toBe('it-IT-Isabella:MAI-Voice-2.1-Flash');
  });

  it('picks the kokoro id whose prefix matches the language', () => {
    expect(pickVoice(['af_heart', 'if_sara', 'im_nicola'], 'it')).toBe('if_sara');
    expect(pickVoice(['af_heart', 'if_sara', 'im_nicola'], 'en')).toBe('af_heart');
  });

  it('falls back to the first voice when nothing matches the language', () => {
    expect(pickVoice(['Zephyr', 'Puck'], 'it')).toBe('Zephyr');
  });

  it('returns the first voice when no language is set', () => {
    expect(pickVoice(['Zephyr', 'Puck'])).toBe('Zephyr');
  });
});

describe('media: fitVideo', () => {
  it('picks the supported duration closest to the requested one', () => {
    expect(fitVideo({ supported_durations: [5, 8] }, { duration: 5 }).duration).toBe(5);
    expect(fitVideo({ supported_durations: [4, 6, 8] }, { duration: 5 }).duration).toBe(4);
  });

  it('keeps the shorter duration on a tie', () => {
    expect(fitVideo({ supported_durations: [4, 6] }, { duration: 5 }).duration).toBe(4);
  });

  it('falls back to the lowest supported resolution when the requested one is not listed', () => {
    expect(fitVideo({ supported_resolutions: ['720p'] }, { resolution: '480p' }).resolution).toBe('720p');
    expect(fitVideo({ supported_resolutions: ['480p', '720p'] }, { resolution: '480p' }).resolution).toBe('480p');
    expect(fitVideo({ supported_resolutions: ['1080p', '720p'] }, { resolution: '4k' }).resolution).toBe('720p');
  });

  it('sends what was asked when there is no entry or the lists are empty', () => {
    expect(fitVideo(null, { duration: 5, resolution: '480p' })).toEqual({ duration: 5, resolution: '480p' });
    expect(fitVideo({ supported_durations: [], supported_resolutions: [] }, { duration: 5, resolution: '480p' }))
      .toEqual({ duration: 5, resolution: '480p' });
  });
});

describe('media: video download auth', () => {
  const doneJob = (url: string) => ({ json: { id: 'job-1', status: 'completed', unsigned_urls: [url], usage: { cost: 0.3 } } });

  it('sends the key when the unsigned URL is on openrouter.ai', async () => {
    const { calls, fetchImpl } = stub([doneJob('https://openrouter.ai/api/v1/videos/job-1/content'), { bytes: new Uint8Array([1, 2]) }]);
    const r = await ENDPOINT_CALLS.videos(
      { key: 'k', fetchImpl, outDir: dir, run: 1, pollMs: 1, videoWaitMs: 5000, videoModels: {} },
      'v/model', task({ endpoint: 'videos' }),
    );
    expect(r.error).toBeNull();
    expect(calls[1].headers.Authorization).toBe('Bearer k');
  });

  it('sends no key to any other host and keeps the cost on a failed download', async () => {
    const { calls, fetchImpl } = stub([doneJob('https://storage.example.com/v.mp4'), { status: 403, bytes: new TextEncoder().encode('expired') }]);
    const r = await ENDPOINT_CALLS.videos(
      { key: 'k', fetchImpl, outDir: dir, run: 1, pollMs: 1, videoWaitMs: 5000, videoModels: {} },
      'v/model', task({ endpoint: 'videos' }),
    );
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(r.error).toMatch(/^HTTP 403/);
    expect(r.cost).toBe(0.3);
    expect(r.raw).toEqual({ id: 'job-1', generation_id: null, duration: null, resolution: null });
  });

  it('sends the fitted duration, resolution and generate_audio false from the catalogue entry', async () => {
    // The front matter is read from the task file, so the requested values go in one.
    const file = join(dir, 'task.md');
    writeFileSync(file, '---\nduration: 5\nresolution: 480p\n---\na red fox\n');
    const { calls, fetchImpl } = stub([doneJob('https://openrouter.ai/api/v1/videos/job-1/content'), { bytes: new Uint8Array([1]) }]);
    const r = await ENDPOINT_CALLS.videos(
      {
        key: 'k', fetchImpl, outDir: dir, run: 1, pollMs: 1, videoWaitMs: 5000,
        videoModels: { 'v/model': { supported_durations: [5, 8], supported_resolutions: ['720p'], generate_audio: true } },
      },
      'v/model', task({ endpoint: 'videos', file }),
    );
    expect(calls[0].body).toEqual({ model: 'v/model', prompt: 'a red fox', duration: 5, resolution: '720p', generate_audio: false });
    expect(r.raw).toEqual({ id: 'job-1', generation_id: null, duration: 5, resolution: '720p' });
  });
});
