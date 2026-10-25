// OpenRouter speech engine: one POST per scene, MP3 back, converted to the 24 kHz
// mono PCM that wav.mjs wraps. MP3 is requested because the PCM sample rate is not
// documented for every provider, so ffmpeg fixes the rate on our side.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RATE, wavFromPcm } from './wav.mjs';

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

/** The JSON body of one speech request; MP3 is the format every provider supports. */
export function speechRequest({ model, voice, text }) {
  return { model, voice, input: text, response_format: 'mp3' };
}

/** Converts an MP3 buffer to 16-bit signed little-endian mono PCM at RATE. */
export function mp3ToPcm(mp3) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', String(RATE), 'pipe:1',
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
    ff.stdin.end(mp3);
  });
}

/**
 * The engine always uses its own voice: Argo passes its default voice name in the
 * options otherwise, which OpenRouter does not know for this model.
 */
export function openrouter({ model, voice, key, fetchImpl = fetch, toPcm = mp3ToPcm }) {
  return {
    describe() {
      return { engine: 'openrouter', model, voice };
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
        body: JSON.stringify(speechRequest({ model, voice, text })),
      });
      if (!res.ok) {
        // The body may echo request details; cut it short and never include the key.
        const body = (await res.text()).slice(0, ERROR_BODY_CHARS);
        throw new Error(`speech request failed (${res.status}): ${body}`);
      }
      return wavFromPcm(await toPcm(Buffer.from(await res.arrayBuffer())));
    },
  };
}
