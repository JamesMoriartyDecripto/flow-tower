// Media endpoints for the benchmark: images, videos, speech, transcriptions. Same contract as endpoints.mjs:
// each call returns { answer, artifact, cost, provider, firstOutputMs, totalMs, error } and never throws.
// Binary results (pictures, video, speech) are written under ctx.outDir/artifacts/; `answer` is that path.
//
//   MEDIA_CALLS[endpoint](ctx, model, task)
//   ctx = { key, fetchImpl = fetch, timeoutMs, outDir, run, pollMs, videoWaitMs }
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
// Speech may report its cost in a header; when the header is absent the cost stays null, never estimated.
const SPEECH_COST_HEADER = 'x-openrouter-cost';
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
const failed = (error, totalMs = 0) => ({ answer: null, artifact: null, cost: 0, provider: null, firstOutputMs: null, totalMs, error });

// Artifacts are named by task, model and run, so a repeat of one cell overwrites only its own file.
function saveArtifact(ctx, task, model, ext, bytes) {
  const name = `${task.id}-${model.replace(/\//g, '__')}-run${ctx.run ?? 1}.${ext}`;
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

// Videos: submit, poll until completed, then download the unsigned URL. The wait is bounded so a stuck job ends
// the cell with an error instead of holding the whole run. `totalMs` runs from submit to download.
async function videos(ctx, model, task) {
  if (!ctx.outDir) return failed(NEEDS_OUT);
  const meta = frontMatter(task);
  const elapsed = clock();
  const body = { model, prompt: task.prompt };
  if (meta.duration) body.duration = Number(meta.duration);
  if (meta.resolution) body.resolution = meta.resolution;
  const sub = await send(ctx, 'POST', `${API}/videos`, { body });
  if (sub.error) return failed(sub.error, elapsed());
  let state = await sub.res.json().catch(() => null);
  if (!state?.id) return failed('bad response: no video id', elapsed());

  const waitMs = ctx.videoWaitMs ?? 10 * 60_000;
  const pollMs = ctx.pollMs ?? 10_000;
  const deadline = performance.now() + waitMs;
  while (state.status !== 'completed') {
    if (state.status === 'failed') return failed('video failed', elapsed());
    if (performance.now() >= deadline) return failed(`video not ready after ${Math.round(waitMs / 1000)}s`, elapsed());
    await sleep(pollMs);
    const p = await send(ctx, 'GET', `${API}/videos/${state.id}`);
    if (p.error) return failed(p.error, elapsed());
    state = await p.res.json().catch(() => null);
    if (!state) return failed('bad response', elapsed());
  }
  const url = state.unsigned_urls?.[0];
  if (!url) return failed('no video url in the response', elapsed());
  const d = await send(ctx, 'GET', url, { auth: false });
  if (d.error) return failed(d.error, elapsed());
  const artifact = saveArtifact(ctx, task, model, 'mp4', Buffer.from(await d.res.arrayBuffer()));
  return { answer: artifact, artifact, cost: state.usage?.cost ?? 0, provider: null, firstOutputMs: null, totalMs: elapsed(), error: null };
}

// Speech: the prompt is read aloud; the bytes are kept as mp3.
async function speech(ctx, model, task) {
  if (!ctx.outDir) return failed(NEEDS_OUT);
  const meta = frontMatter(task);
  const elapsed = clock();
  const body = { model, input: task.prompt, response_format: 'mp3' };
  if (meta.voice) body.voice = meta.voice;
  const r = await send(ctx, 'POST', `${API}/audio/speech`, { body });
  if (r.error) return failed(r.error, elapsed());
  const bytes = Buffer.from(await r.res.arrayBuffer());
  const raw = r.res.headers?.get?.(SPEECH_COST_HEADER);
  const cost = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
  const artifact = saveArtifact(ctx, task, model, 'mp3', bytes);
  const totalMs = elapsed();
  return { answer: artifact, artifact, cost, provider: null, firstOutputMs: totalMs, totalMs, error: null };
}

// Transcriptions: the audio fixture goes in as plain base64 (no data URL), its extension names the format.
async function transcriptions(ctx, model, task) {
  if (!task.audio) return failed('transcriptions needs an audio: fixture');
  const format = extname(task.audio).slice(1).toLowerCase();
  if (!AUDIO_FORMATS.includes(format)) return failed(`audio format must be one of ${AUDIO_FORMATS.join(', ')}: ${task.audio}`);
  const meta = frontMatter(task);
  const elapsed = clock();
  const data = readFileSync(join(task.dir, task.audio)).toString('base64');
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
