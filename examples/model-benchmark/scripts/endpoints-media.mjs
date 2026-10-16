// Media endpoints for the benchmark: images, videos, speech, transcriptions. Same contract as endpoints.mjs:
// each call returns { answer, artifact, cost, provider, firstOutputMs, totalMs, error } and never throws.
// Binary results (pictures, video, speech) are written under ctx.outDir/artifacts/; `answer` is that path.
//
//   MEDIA_CALLS[endpoint](ctx, model, task)
//   ctx = { key, fetchImpl = fetch, timeoutMs, outDir, run, pollMs, videoWaitMs, voices, videoModels }
//   voices (optional): model id -> voice list, used in place of the catalogue fetch (tests).
//   videoModels (optional): model id -> /videos/models entry, used in place of that fetch (tests).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { inside } from './endpoints.mjs';

const API = 'https://openrouter.ai/api/v1';
// Speech may report its cost in a header; when the header is absent the cost stays null, never estimated.
const SPEECH_COST_HEADER = 'x-openrouter-cost';
// The voice catalogue is a small public list; a slow answer should not hold up the whole run.
const VOICE_LIST_TIMEOUT_MS = 20_000;
// The video catalogue lists what each model accepts; the same slow-answer limit applies.
const VIDEO_LIST_TIMEOUT_MS = 20_000;
const AUDIO_FORMATS = ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'webm'];
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A timer started now; the returned function gives the milliseconds since then, rounded.
const clock = () => {
  const t0 = performance.now();
  return () => Math.round(performance.now() - t0);
};

// The loader does not expose duration, resolution, voice or language, so they are read from the task file here.
// A task with no file (a test stub) has no front matter to read.
function frontMatter(task) {
  if (!task.file) return {};
  const m = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(task.file, 'utf8'));
  const meta = {};
  for (const line of (m?.[1] ?? '').split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return meta;
}

// One request. Errors come back as a value so a benchmark run does not stop on one call.
// Only the API calls carry the key: the video download is an unsigned URL and must not get it.
async function send(ctx, method, url, { body, auth = true } = {}) {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const timeoutMs = ctx.timeoutMs ?? 180_000;
  const headers = auth ? { Authorization: `Bearer ${ctx.key}`, 'X-Title': 'Flow Tower model-benchmark' } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { error: `no answer: ${e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : e.name}` };
  }
  if (!res.ok) {
    // Cut to 200 characters: enough to read a refusal, too little to echo a whole prompt.
    return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
  }
  return { res };
}

// A failed call: no answer, the error kept as text.
// `extra` lets a failure after the submit keep what was paid for (cost, raw ids) so the clip can be traced.
const failed = (error, totalMs = 0, extra = {}) => ({ answer: null, artifact: null, cost: 0, provider: null, firstOutputMs: null, totalMs, error, ...extra });

// Artifacts are named by task, model and run, so a repeat of one cell overwrites only its own file.
// Every character outside [A-Za-z0-9._-] becomes `_`, so a task or model id can never add a path separator.
// The model's `/` is turned into `__` first, so `a/b` stays readable as `a__b`.
function saveArtifact(ctx, task, model, ext, bytes) {
  const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');
  const name = `${safe(task.id)}-${safe(String(model).replace(/\//g, '__'))}-run${ctx.run ?? 1}.${ext}`;
  const dir = join(ctx.outDir, 'artifacts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), bytes);
  return `artifacts/${name}`;
}

const NEEDS_OUT = 'no outDir: media artifacts are written there';

// Images: the prompt in, the first picture out. The extension follows media_type; png when it is missing.
async function images(ctx, model, task) {
  if (!ctx.outDir) return failed(NEEDS_OUT);
  const elapsed = clock();
  const r = await send(ctx, 'POST', `${API}/images`, { body: { model, prompt: task.prompt } });
  if (r.error) return failed(r.error, elapsed());
  const data = await r.res.json().catch(() => null);
  if (!data) return failed('bad response', elapsed());
  const img = data.data?.[0];
  if (!img?.b64_json) return failed('no image in the response', elapsed());
  const artifact = saveArtifact(ctx, task, model, IMAGE_EXT[img.media_type] ?? 'png', Buffer.from(img.b64_json, 'base64'));
  // Not streamed: the first output and the total are the same moment.
  const totalMs = elapsed();
  return { answer: artifact, artifact, cost: data.usage?.cost ?? 0, provider: null, firstOutputMs: totalMs, totalMs, error: null };
}

// The video catalogue lists, per model, the durations and resolutions it accepts. One fetch per process; a failed
// fetch gives an empty map for this call, and is not cached, so the next call tries the catalogue again.
let videoCatalogue = null;
function fetchVideoCatalogue(ctx) {
  if (!videoCatalogue) {
    const fetchImpl = ctx.fetchImpl ?? fetch;
    videoCatalogue = fetchImpl(`${API}/videos/models`, { signal: AbortSignal.timeout(VIDEO_LIST_TIMEOUT_MS) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((j) => new Map((Array.isArray(j) ? j : (j?.data ?? [])).map((m) => [m.id, m])))
      .catch(() => {
        videoCatalogue = null; // a failure is not remembered
        return new Map();
      });
  }
  return videoCatalogue;
}

// The catalogue entry for one model. ctx.videoModels lets a test stand in for the fetch, as ctx.voices does.
async function videoEntry(ctx, model) {
  if (ctx.videoModels) return ctx.videoModels[model] ?? null;
  return (await fetchVideoCatalogue(ctx)).get(model) ?? null;
}

// The duration and resolution to send. The closest supported duration wins (a tie goes to the shorter one), and
// the requested resolution is kept when supported, else the lowest one. A value the task did not ask for stays
// unset, and an empty or missing list means nothing is known, so the request is sent as asked.
export function fitVideo(entry, { duration, resolution } = {}) {
  const asked = { duration, resolution };
  if (!entry) return asked;
  const durations = (Array.isArray(entry.supported_durations) ? entry.supported_durations : []).filter(Number.isFinite);
  const resolutions = (Array.isArray(entry.supported_resolutions) ? entry.supported_resolutions : []).filter(
    (r) => typeof r === 'string' && /\d/.test(r),
  );
  let fitDuration = duration;
  if (durations.length && duration !== undefined) {
    // Sorted ascending and compared with a strict <, so an equal distance keeps the shorter duration.
    fitDuration = [...durations].sort((a, b) => a - b).reduce((best, d) => (Math.abs(d - duration) < Math.abs(best - duration) ? d : best));
  }
  let fitResolution = resolution;
  if (resolutions.length && resolution !== undefined && !resolutions.includes(resolution)) {
    // Order by the number in the name ("480p" < "720p"), so the smallest frame is the fallback.
    const height = (r) => Number(/\d+/.exec(r)[0]);
    fitResolution = [...resolutions].sort((a, b) => height(a) - height(b))[0];
  }
  return { duration: fitDuration, resolution: fitResolution };
}

// Videos: submit, poll until completed, then download the unsigned URL. The wait is bounded so a stuck job ends
// the cell with an error instead of holding the whole run. `totalMs` runs from submit to download.
async function videos(ctx, model, task) {
  if (!ctx.outDir) return failed(NEEDS_OUT);
  const meta = frontMatter(task);
  const elapsed = clock();
  const entry = await videoEntry(ctx, model);
  const fit = fitVideo(entry, { duration: meta.duration ? Number(meta.duration) : undefined, resolution: meta.resolution });
  const body = { model, prompt: task.prompt };
  if (fit.duration !== undefined) body.duration = fit.duration;
  if (fit.resolution !== undefined) body.resolution = fit.resolution;
  // Audio costs more and is not judged, so it is switched off when the model can turn it off.
  if (entry?.generate_audio === true) body.generate_audio = false;
  const sub = await send(ctx, 'POST', `${API}/videos`, { body });
  if (sub.error) return failed(sub.error, elapsed());
  let state = await sub.res.json().catch(() => null);
  if (!state?.id) return failed('bad response: no video id', elapsed());

  // Once submitted the job is billed, so every failure from here on carries what was sent and the cost so far.
  const raw = { id: state.id, generation_id: state.generation_id ?? null, duration: body.duration ?? null, resolution: body.resolution ?? null };
  const fail = (error) => failed(error, elapsed(), { raw, cost: state?.usage?.cost ?? 0 });

  const waitMs = ctx.videoWaitMs ?? 10 * 60_000;
  const pollMs = ctx.pollMs ?? 10_000;
  const deadline = performance.now() + waitMs;
  while (state.status !== 'completed') {
    if (state.status === 'failed') return fail('video failed');
    if (performance.now() >= deadline) return fail(`video not ready after ${Math.round(waitMs / 1000)}s`);
    await sleep(pollMs);
    const p = await send(ctx, 'GET', `${API}/videos/${state.id}`);
    if (p.error) return fail(p.error);
    state = await p.res.json().catch(() => null);
    if (!state) return failed('bad response', elapsed(), { raw, cost: 0 });
  }
  const url = state.unsigned_urls?.[0];
  if (!url) return fail('no video url in the response');
  // The key goes only to openrouter.ai. Any other host is a signed or public storage URL, and sending the key
  // there would leak it to a third party.
  // Https only: a plain http URL to the same host would still send the key in the clear.
  let keyed = false;
  try { const u = new URL(url); keyed = u.protocol === 'https:' && u.hostname === 'openrouter.ai'; } catch { /* a malformed URL gets no key and fails in the fetch */ }
  const d = await send(ctx, 'GET', url, { auth: keyed });
  if (d.error) return fail(d.error);
  const artifact = saveArtifact(ctx, task, model, 'mp4', Buffer.from(await d.res.arrayBuffer()));
  return { answer: artifact, artifact, cost: state.usage?.cost ?? 0, provider: null, firstOutputMs: null, totalMs: elapsed(), error: null, raw };
}

// Some speech providers refuse a request with no voice, so a voice is picked from the provider's own list.
// Voices come from one catalogue fetch per process; a failed fetch leaves the map empty, so the call goes out
// without a voice and the provider's error is reported as before.
let voiceCatalogue = null;
function fetchVoiceCatalogue(ctx) {
  if (!voiceCatalogue) {
    const fetchImpl = ctx.fetchImpl ?? fetch;
    voiceCatalogue = fetchImpl(`${API}/models?output_modalities=speech`, { signal: AbortSignal.timeout(VOICE_LIST_TIMEOUT_MS) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((j) => new Map((j?.data ?? []).map((m) => [m.id, m.supported_voices ?? []])))
      .catch(() => {
        voiceCatalogue = null; // a failure is not remembered, so the next call asks again
        return new Map();
      });
  }
  return voiceCatalogue;
}

// The first voice that fits the language: a `<lang>-` tag (Microsoft style), then a kokoro-style id such as
// `if_sara` (language initial, then f or m). English also takes the a and b prefixes of the kokoro ids.
// Without a language, or with no match, the first voice is used; an empty list means no voice at all.
export function pickVoice(voices, language) {
  if (!Array.isArray(voices) || voices.length === 0) return undefined;
  if (!language) return voices[0];
  const lang = language.toLowerCase().split('-')[0];
  const tagged = voices.find((v) => v.toLowerCase().startsWith(`${lang}-`));
  if (tagged) return tagged;
  const initials = lang === 'en' ? ['a', 'b'] : [lang[0]];
  const kokoro = voices.find((v) => {
    const m = /^([a-z])([fm])_/i.exec(v);
    return m && initials.includes(m[1].toLowerCase());
  });
  return kokoro ?? voices[0];
}

// Some speech models (Gemini TTS) take only PCM and refuse mp3 with a 400 that names pcm. PCM is raw 16-bit
// little-endian samples with no header, so a WAV header is added to make the saved file playable.
const PCM_TYPE = /^audio\/pcm/i;
export function pcmToWav(pcmBuffer, rate, channels) {
  const data = Buffer.from(pcmBuffer);
  const blockAlign = channels * 2;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// Rate and channels come from the Content-Type parameters, e.g. `audio/pcm;rate=24000;channels=1`.
function pcmFormat(contentType) {
  const rate = Number(/rate=(\d+)/i.exec(contentType)?.[1]) || 24000;
  const channels = Number(/channels=(\d+)/i.exec(contentType)?.[1]) || 1;
  return { rate, channels };
}

// Speech: the prompt is read aloud; the bytes are kept as mp3, or as wav when the model answers in PCM.
async function speech(ctx, model, task) {
  if (!ctx.outDir) return failed(NEEDS_OUT);
  const meta = frontMatter(task);
  const elapsed = clock();
  const body = { model, input: task.prompt, response_format: 'mp3' };
  if (meta.voice) {
    body.voice = meta.voice;
  } else {
    // ctx.voices lets a test stand in for the catalogue, so no extra request reaches its stub.
    const list = ctx.voices ? ctx.voices[model] : (await fetchVoiceCatalogue(ctx)).get(model);
    const voice = pickVoice(list, meta.language);
    if (voice) body.voice = voice;
  }
  let r = await send(ctx, 'POST', `${API}/audio/speech`, { body });
  // Retry once in pcm, and only for the 400 that names pcm: any other refusal is reported as it is.
  if (r.error?.startsWith('HTTP 400') && /pcm/i.test(r.error)) {
    body.response_format = 'pcm';
    r = await send(ctx, 'POST', `${API}/audio/speech`, { body });
  }
  if (r.error) return failed(r.error, elapsed());
  let bytes = Buffer.from(await r.res.arrayBuffer());
  const type = r.res.headers?.get?.('content-type') ?? '';
  const isPcm = PCM_TYPE.test(type);
  if (isPcm) {
    const { rate, channels } = pcmFormat(type);
    bytes = pcmToWav(bytes, rate, channels);
  }
  const raw = r.res.headers?.get?.(SPEECH_COST_HEADER);
  const cost = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
  const artifact = saveArtifact(ctx, task, model, isPcm ? 'wav' : 'mp3', bytes);
  const totalMs = elapsed();
  return { answer: artifact, artifact, cost, voice: body.voice ?? null, provider: null, firstOutputMs: totalMs, totalMs, error: null };
}

// Transcriptions: the audio fixture goes in as plain base64 (no data URL), its extension names the format.
async function transcriptions(ctx, model, task) {
  if (!task.audio) return failed('transcriptions needs an audio: fixture');
  const format = extname(task.audio).slice(1).toLowerCase();
  if (!AUDIO_FORMATS.includes(format)) return failed(`audio format must be one of ${AUDIO_FORMATS.join(', ')}: ${task.audio}`);
  const meta = frontMatter(task);
  const elapsed = clock();
  const path = inside(task.dir, task.audio);
  if (!path) return failed(`audio outside the task folder: ${task.audio}`);
  const data = readFileSync(path).toString('base64');
  const body = { model, input_audio: { data, format } };
  if (meta.language) body.language = meta.language;
  const r = await send(ctx, 'POST', `${API}/audio/transcriptions`, { body });
  if (r.error) return failed(r.error, elapsed());
  const j = await r.res.json().catch(() => null);
  if (typeof j?.text !== 'string') return failed('bad response: no text', elapsed());
  const totalMs = elapsed();
  return { answer: j.text, artifact: null, cost: j.usage?.cost ?? 0, provider: null, firstOutputMs: totalMs, totalMs, error: null };
}

export const MEDIA_CALLS = { images, videos, speech, transcriptions };
