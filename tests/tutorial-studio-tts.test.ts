import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { silence, wavFromFloat } from '../examples/tutorial-studio/tts/wav.mjs';
import { estimateSeconds, silent } from '../examples/tutorial-studio/tts/silent.mjs';
import {
  SPEECH_URL,
  openrouter,
  pcmFormat,
  readKey,
  speechRequest,
} from '../examples/tutorial-studio/tts/openrouter.mjs';

const LONG_TEXT = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');

describe('wavFromFloat', () => {
  it('writes a canonical 44-byte float header before the samples', () => {
    const wav = wavFromFloat(Buffer.alloc(8));
    expect(wav.length).toBe(52);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + 8);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(3);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(28)).toBe(96000);
    expect(wav.readUInt16LE(32)).toBe(4);
    expect(wav.readUInt16LE(34)).toBe(32);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(8);
  });

  it('keeps float samples readable by Argo', () => {
    const samples = Buffer.from(Float32Array.of(0.5, -0.25).buffer);
    const wav = wavFromFloat(samples);
    expect(wav.readFloatLE(44)).toBe(0.5);
    expect(wav.readFloatLE(48)).toBe(-0.25);
  });
});

describe('silence', () => {
  it('holds one second of 32-bit mono samples at 24 kHz', () => {
    expect(silence(1).length).toBe(44 + 96000);
  });
});

describe('estimateSeconds', () => {
  it('uses 2.5 words a second', () => {
    expect(estimateSeconds('one two three four five')).toBe(2);
  });

  it('never goes below 1.5 seconds', () => {
    expect(estimateSeconds('hi')).toBe(1.5);
  });

  it('does not count empty strings from extra spaces as words', () => {
    expect(estimateSeconds('  a  b  ')).toBe(1.5);
  });
});

describe('silent engine', () => {
  it('describes itself', () => {
    expect(silent.describe()).toEqual({ engine: 'silent' });
  });

  it('generates a clip of 10 seconds for 25 words', async () => {
    const wav = await silent.generate(LONG_TEXT);
    expect(wav.readUInt32LE(40)).toBe(10 * 96000);
  });
});

describe('openrouter speech engine', () => {
  let savedHome: string | undefined;
  let savedKey: string | undefined;

  beforeEach(() => {
    savedHome = process.env.FLOW_TOWER_HOME;
    savedKey = process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.FLOW_TOWER_HOME;
    else process.env.FLOW_TOWER_HOME = savedHome;
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedKey;
  });

  it('trims the key from the environment', () => {
    expect(readKey({ env: { OPENROUTER_API_KEY: ' sk-a ' } })).toBe('sk-a');
  });

  it('reads a quoted export line from the .env file in the user folder', () => {
    const home = mkdtempSync(join(tmpdir(), 'or-home-'));
    writeFileSync(join(home, '.env'), 'OTHER=1\nexport OPENROUTER_API_KEY="sk-b"\n');
    expect(readKey({ env: {}, home })).toBe('sk-b');
  });

  it('returns undefined when no key is stored', () => {
    const home = mkdtempSync(join(tmpdir(), 'or-empty-'));
    expect(readKey({ env: {}, home })).toBeUndefined();
  });

  it('builds the speech request with MP3 output', () => {
    expect(speechRequest({ model: 'm', voice: 'v', text: 't' })).toEqual({
      model: 'm',
      voice: 'v',
      input: 't',
      response_format: 'mp3',
    });
  });

  it('builds a PCM speech request when the format is pcm', () => {
    expect(speechRequest({ model: 'm', voice: 'v', text: 't', format: 'pcm' }).response_format).toBe('pcm');
  });

  it('reads the rate and channels from a PCM content type', () => {
    expect(pcmFormat('audio/pcm;rate=24000;channels=1')).toEqual({ rate: 24000, channels: 1 });
    expect(pcmFormat('audio/pcm; rate = 16000 ; channels=2')).toEqual({ rate: 16000, channels: 2 });
  });

  it('falls back to 24 kHz mono when the PCM content type lacks a valid rate or channels', () => {
    expect(pcmFormat('audio/pcm')).toEqual({ rate: 24000, channels: 1 });
    expect(pcmFormat('audio/pcm;rate=abc')).toEqual({ rate: 24000, channels: 1 });
  });

  it('converts a PCM reply using the rate and channels from its content type', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(4), {
      headers: { 'content-type': 'audio/pcm;rate=16000;channels=1' },
    }));
    const toFloat = vi.fn(async () => Buffer.alloc(4));
    const engine = openrouter({ model: 'm', voice: 'v', format: 'pcm', key: 'sk-test', fetchImpl, toFloat });

    await engine.generate('hello');

    expect(toFloat).toHaveBeenCalledWith(expect.any(Buffer), { format: 'pcm', rate: 16000, channels: 1 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).response_format).toBe('pcm');
  });

  it('describes the response format', () => {
    expect(openrouter({ model: 'm', voice: 'v', format: 'pcm' }).describe()).toEqual({
      engine: 'openrouter',
      model: 'm',
      voice: 'v',
      format: 'pcm',
    });
  });

  it('posts the request and returns a WAV built from the float samples', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2])));
    const toFloat = vi.fn(async () => Buffer.alloc(4));
    const engine = openrouter({ model: 'm', voice: 'v', key: 'sk-test', fetchImpl, toFloat });

    const wav = await engine.generate('hello');

    expect(wav.length).toBe(48);
    expect(toFloat).toHaveBeenCalledWith(expect.any(Buffer), { format: 'mp3' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SPEECH_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'm',
      voice: 'v',
      input: 'hello',
      response_format: 'mp3',
    });
  });

  it('reports the status and body on failure without the key', async () => {
    const fetchImpl = async () => new Response('quota', { status: 402 });
    const engine = openrouter({ model: 'm', voice: 'v', key: 'sk-test', fetchImpl });

    const err = await engine.generate('hello').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('402');
    expect((err as Error).message).toContain('quota');
    expect((err as Error).message).not.toContain('sk-test');
  });

  it('fails before any request when no key is available', async () => {
    process.env.FLOW_TOWER_HOME = mkdtempSync(join(tmpdir(), 'or-nokey-'));
    delete process.env.OPENROUTER_API_KEY;
    const fetchImpl = vi.fn(async () => new Response(''));
    const engine = openrouter({ model: 'm', voice: 'v', fetchImpl });

    await expect(engine.generate('hello')).rejects.toThrow('OPENROUTER_API_KEY not found');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gives the speech request a timeout signal', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2])));
    const toFloat = vi.fn(async () => Buffer.alloc(4));
    const engine = openrouter({ model: 'm', voice: 'v', key: 'sk-test', fetchImpl, toFloat });

    await engine.generate('hello');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
