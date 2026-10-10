import type { IncomingMessage, ServerResponse } from 'node:http';

export const OPENROUTER_STT = 'https://openrouter.ai/api/v1/audio/transcriptions';
export const DEFAULT_VOICE_MODEL = 'openai/whisper-large-v3-turbo';
/** A spoken command is a few seconds of Opus: ~1 MB of base64 is minutes of audio. */
const MAX_BODY = 2_000_000;
const FORMATS = new Set(['webm', 'ogg', 'm4a', 'wav', 'mp3']);

export interface VoiceConfig {
  /** OPENROUTER_API_KEY. It stays on this server: the browser never sees it. */
  key?: string;
  model: string;
  /** Route only to providers that keep no data (OpenRouter `provider.zdr`). */
  zdr: boolean;
  fetch?: typeof fetch;
}

/**
 * GET /api/voice → { cloud, model }: whether transcription is configured (never the key).
 * POST /api/voice { audio: base64, format, language? } → { text, ms, cost } via OpenRouter's
 * speech-to-text endpoint. JSON only, like /api/events, so other web pages cannot post here.
 */
export function voiceHandler(cfg: VoiceConfig) {
  const call = cfg.fetch ?? fetch;
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET') return json(res, 200, { cloud: !!cfg.key, model: cfg.model });
    if (req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
    if (!req.headers['content-type']?.includes('application/json')) return json(res, 415, { error: 'content-type must be application/json' });
    if (!cfg.key) return json(res, 503, { error: 'Voice commands need OPENROUTER_API_KEY: put it in flow-tower/.env (git-ignored) or the environment, then restart.' });

    let body: { audio?: unknown; format?: unknown; language?: unknown };
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return json(res, (err as Error).message === 'too large' ? 413 : 400, { error: 'body must be JSON under 2 MB' });
    }
    const { audio, format, language } = body;
    if (typeof audio !== 'string' || !audio || typeof format !== 'string' || !FORMATS.has(format)) {
      return json(res, 400, { error: `send { audio: base64, format: ${[...FORMATS].join(' | ')} }` });
    }

    const started = Date.now();
    try {
      const r = await call(OPENROUTER_STT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower' },
        body: JSON.stringify({
          model: cfg.model,
          input_audio: { data: audio, format },
          ...(typeof language === 'string' && /^[a-z]{2}$/.test(language) ? { language } : {}),
          ...(cfg.zdr ? { provider: { zdr: true } } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const out = (await r.json().catch(() => ({}))) as { text?: string; usage?: { cost?: number }; error?: { message?: string } };
      if (!r.ok) return json(res, 502, { error: `OpenRouter ${r.status}: ${out.error?.message ?? 'transcription failed'}` });
      json(res, 200, { text: (out.text ?? '').trim(), ms: Date.now() - started, cost: out.usage?.cost });
    } catch (err) {
      json(res, 502, { error: `OpenRouter unreachable: ${(err as Error).message}` });
    }
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
