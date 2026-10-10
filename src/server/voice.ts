import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite, isJson } from './guard.ts';
import { learningRoutes, type LearningDeps } from './voice-learning.ts';

export const OPENROUTER = 'https://openrouter.ai/api/v1';
export const OPENROUTER_STT = `${OPENROUTER}/audio/transcriptions`;
/** Defaults picked on 2026-10-10 (examples/voice-commands/options): fast, cheap, multilingual, zero data retention. */
export const VOICE_DEFAULTS = {
  stt: 'openai/whisper-large-v3-turbo',
  chat: 'google/gemini-3.1-flash-lite',
  tts: 'elevenlabs/eleven-flash-v2.5',
  /** One voice that speaks every language the model knows: the reply follows the user's language. */
  voice: 'alice',
};
const FORMATS = new Set(['webm', 'ogg', 'm4a', 'wav', 'mp3']);
/** Sent by the app's own page. No simple (preflight-free) request can carry a custom header. */
export const VOICE_HEADER = 'x-flow-tower-voice';
/** Upstream calls at once (a turn overlaps transcription, a streamed chat and a few sentences of speech): a loop cannot run up the bill. */
const MAX_IN_FLIGHT = 6;
/** Per route: a spoken command is ~10 KB of Opus; a conversation a few KB of JSON; a reply a few sentences. */
const LIMITS = { stt: 2_000_000, chat: 256_000, speak: 8_000 } as const;
const MAX_REPLY_CHARS = 800;

export interface VoiceConfig {
  /** OPENROUTER_API_KEY. It stays on this server: the browser never sees it. */
  key?: string;
  /** Speech-to-text model (kept as `model` for the transcription-only callers). */
  model: string;
  chatModel?: string;
  ttsModel?: string;
  voice?: string;
  /** Route only to providers that keep no data (OpenRouter `provider.zdr`). */
  zdr: boolean;
  fetch?: typeof fetch;
  /** The voice journal and memory (#68); without it, those routes are not mounted. */
  learning?: Pick<LearningDeps, 'store' | 'names'>;
}

interface Route {
  limit: number;
  /** Works without OPENROUTER_API_KEY: nothing goes upstream. */
  keyless?: boolean;
  get?(res: ServerResponse): void;
  run(res: ServerResponse, body: Record<string, unknown>): Promise<void>;
}

/**
 * The voice server, all through OpenRouter with the key kept here:
 * - GET  /api/voice        → { cloud, model, agent, tts }: what is configured (never the key);
 * - POST /api/voice        { audio: base64, format, language? } → { text, ms, cost }   speech to text;
 * - POST /api/voice/chat   { messages, tools, answer?, stream? } → { message, ms, cost } one LLM step, or its SSE stream;
 * - POST /api/voice/speak  { text }                             → audio/mpeg            the spoken reply;
 * - /api/voice/journal, /memory, /review: the voice journal and what it learned (voice-learning.ts).
 * Each call spends the user's key, so only this app's page gets through: exact JSON content type,
 * no cross-site Origin, and the custom VOICE_HEADER (src/server/guard.ts).
 */
export function voiceHandler(cfg: VoiceConfig) {
  const call = cfg.fetch ?? fetch;
  const chatModel = cfg.chatModel ?? VOICE_DEFAULTS.chat;
  const ttsModel = cfg.ttsModel ?? VOICE_DEFAULTS.tts;
  const voice = cfg.voice ?? VOICE_DEFAULTS.voice;
  const provider = cfg.zdr ? { zdr: true } : undefined;
  let inFlight = 0;

  const upstream = (path: string, body: object) => call(`${OPENROUTER}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const failed = async (res: ServerResponse, r: Response) => {
    const out = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    json(res, 502, { error: `OpenRouter ${r.status}: ${out.error?.message ?? 'request failed'}` });
  };

  const routes: Record<string, Route> = {
    '/': {
      limit: LIMITS.stt,
      async run(res, { audio, format, language }) {
        if (typeof audio !== 'string' || !audio || typeof format !== 'string' || !FORMATS.has(format)) {
          return json(res, 400, { error: `send { audio: base64, format: ${[...FORMATS].join(' | ')} }` });
        }
        const started = Date.now();
        const r = await upstream('/audio/transcriptions', {
          model: cfg.model,
          input_audio: { data: audio, format },
          ...(typeof language === 'string' && /^[a-z]{2}$/.test(language) ? { language } : {}),
          ...(provider && { provider }),
        });
        if (!r.ok) return failed(res, r);
        const out = (await r.json()) as { text?: string; usage?: { cost?: number } };
        json(res, 200, { text: (out.text ?? '').trim(), ms: Date.now() - started, cost: out.usage?.cost });
      },
    },
    '/chat': {
      limit: LIMITS.chat,
      async run(res, { messages, tools, answer, stream }) {
        if (!Array.isArray(messages) || !messages.length || messages.length > 60 || !Array.isArray(tools) || tools.length > 20) {
          return json(res, 400, { error: 'send { messages: [...] (max 60), tools: [...] (max 20) }' });
        }
        const started = Date.now();
        const r = await upstream('/chat/completions', {
          model: chatModel, messages, tools, max_tokens: 500,
          // The last step of a turn must answer with what it has: no more tool calls.
          tool_choice: answer === true ? 'none' : 'auto',
          // Only providers that support every parameter sent (tools above all), and keep no data.
          provider: { ...provider, require_parameters: true },
          // Streamed: the page shows the reply as it is written and speaks its first sentence early.
          ...(stream === true && { stream: true, usage: { include: true } }),
        });
        if (!r.ok) return failed(res, r);
        if (stream === true && r.body) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-store');
          for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
          return void res.end();
        }
        const out = (await r.json()) as { choices?: { message?: unknown }[]; usage?: { cost?: number } };
        json(res, 200, { message: out.choices?.[0]?.message ?? { role: 'assistant', content: '' }, ms: Date.now() - started, cost: out.usage?.cost });
      },
    },
    '/speak': {
      limit: LIMITS.speak,
      async run(res, { text }) {
        if (typeof text !== 'string' || !text.trim()) return json(res, 400, { error: 'send { text }' });
        const r = await upstream('/audio/speech', {
          model: ttsModel, voice, input: text.slice(0, MAX_REPLY_CHARS), response_format: 'mp3', ...(provider && { provider }),
        });
        if (!r.ok) return failed(res, r);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.end(Buffer.from(await r.arrayBuffer()));
      },
    },
    ...(cfg.learning && learningRoutes({
      ...cfg.learning,
      send: json,
      complete: (body) => upstream('/chat/completions', { model: chatModel, ...body, provider: { ...provider, require_parameters: true } }),
    })),
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    const route = routes[(req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/'];
    if (!route) return json(res, 404, { error: 'unknown voice route' });
    // Reads are personal too (memory, stats): only this page, like the other read endpoints.
    if (req.method === 'GET' && crossSite(req)) return json(res, 403, { error: 'cross-site requests are refused' });
    if (req.method === 'GET') return route.get ? route.get(res) : json(res, 200, { cloud: !!cfg.key, model: cfg.model, agent: chatModel, tts: ttsModel, journal: !!cfg.learning });
    if (req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
    if (!isJson(req)) return json(res, 415, { error: 'content-type must be application/json' });
    if (crossSite(req) || req.headers[VOICE_HEADER] !== '1') return json(res, 403, { error: 'only the Flow Tower page can use /api/voice' });
    if (!cfg.key && !route.keyless) return json(res, 503, { error: 'Voice commands need OPENROUTER_API_KEY: put it in ~/.config/flow-tower/.env (or, as a fallback, the git-ignored .env in the flow-tower folder) or the environment, then restart.' });

    // Reserved before the body is read, so parallel requests cannot each buffer a body first.
    if (inFlight >= MAX_IN_FLIGHT) return json(res, 429, { error: 'too many voice requests at once' });
    inFlight++;
    try {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await readBody(req, route.limit));
      } catch (err) {
        return json(res, (err as Error).message === 'too large' ? 413 : 400, { error: `body must be JSON under ${route.limit} bytes` });
      }
      await route.run(res, body ?? {});
    } catch (err) {
      json(res, 502, { error: `OpenRouter unreachable: ${(err as Error).message}` });
    } finally {
      inFlight--;
    }
  };
}

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); return; }
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
