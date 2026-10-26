// OpenRouter speech engine: one POST per scene, converted to the 24 kHz mono float samples
// that wav.mjs wraps. Each model takes its own response format: MP3 by default, PCM for
// models that refuse MP3 (the PCM header carries its rate and channels). ffmpeg fixes the
// rate on our side either way.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RATE, wavFromFloat } from './wav.mjs';

export const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';

const KEY_LINE = /^\s*(export\s+)?OPENROUTER_API_KEY=(.*)$/m;
const ERROR_BODY_CHARS = 300;

/** Strips one matching pair of surrounding single or double quotes. */
function unquote(value) {
  const first = value[0];
  if (value.length >= 2 && (first === '"' || first === "'") && value.at(-1) === first) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * The key comes from the environment first, then from the .env file in the flow-tower
 * user folder that `flow-tower squad key` writes. It is never logged or echoed.
 */
export function readKey({ env = process.env, home } = {}) {
  const fromEnv = env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const dir = home ?? (env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower'));
  let text;
  try {
    text = readFileSync(join(dir, '.env'), 'utf8');
  } catch {
    return undefined;
  }
  const match = KEY_LINE.exec(text);
  if (!match) return undefined;
  return unquote(match[2].trim()).trim() || undefined;
}

/**
 * The JSON body of one speech request. MP3 is the default because every provider takes it;
 * some models (Gemini TTS on OpenRouter) accept only 'pcm', so the caller picks per model.
 */
export function speechRequest({ model, voice, text, format = 'mp3' }) {
  return { model, voice, input: text, response_format: format };
}

const DEFAULT_PCM = { rate: 24000, channels: 1 };

/** Reads one positive integer parameter such as rate=24000 from a Content-Type value. */
function pcmParam(contentType, name, fallback) {
  const match = new RegExp(`;\\s*${name}\\s*=\\s*([^;\\s]+)`, 'i').exec(contentType);
  if (!match || !/^\d+$/.test(match[1])) return fallback;
  const value = Number(match[1]);
  return value > 0 ? value : fallback;
}

/**
 * The sample rate and channel count of a PCM reply, e.g. `audio/pcm;rate=24000;channels=1`.
 * The model states them in the header; the defaults match what it returned so far.
 */
export function pcmFormat(contentType) {
  return {
    rate: pcmParam(contentType, 'rate', DEFAULT_PCM.rate),
    channels: pcmParam(contentType, 'channels', DEFAULT_PCM.channels),
  };
}

/**
 * Converts encoded audio to 32-bit float little-endian mono samples at RATE. MP3 is
 * self-describing; raw PCM needs its rate and channel count to be read at all.
 */
export function toFloat(audio, input = { format: 'mp3' }) {
  const inputArgs = input.format === 'pcm'
    ? ['-f', 's16le', '-ar', String(input.rate), '-ac', String(input.channels), '-i', 'pipe:0']
    : ['-i', 'pipe:0'];
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      ...inputArgs, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), 'pipe:1',
    ]);
    const out = [];
    let err = '';
    ff.stdout.on('data', (chunk) => out.push(chunk));
    ff.stderr.on('data', (chunk) => { err += chunk; });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg failed (${code}): ${err}`));
    });
    ff.stdin.on('error', () => {}); // a dying ffmpeg reports through its exit code
    ff.stdin.end(audio);
  });
}

/**
 * The engine always uses its own voice: Argo passes its default voice name in the
 * options otherwise, which OpenRouter does not know for this model.
 */
export function openrouter({ model, voice, format = 'mp3', key, fetchImpl = fetch, toFloat: convert = toFloat }) {
  return {
    describe() {
      return { engine: 'openrouter', model, voice, format };
    },
    async generate(text) {
      const apiKey = key ?? readKey();
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY not found: set it in the environment or run flow-tower squad key');
      }
      const res = await fetchImpl(SPEECH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(speechRequest({ model, voice, text, format })),
      });
      if (!res.ok) {
        // The body may echo request details; cut it short and never include the key.
        const body = (await res.text()).slice(0, ERROR_BODY_CHARS);
        throw new Error(`speech request failed (${res.status}): ${body}`);
      }
      // The PCM reply has no container, so its rate and channels come from the header.
      const input = format === 'pcm'
        ? { format: 'pcm', ...pcmFormat(res.headers.get('content-type') ?? '') }
        : { format: 'mp3' };
      return wavFromFloat(await convert(Buffer.from(await res.arrayBuffer()), input));
    },
  };
}
