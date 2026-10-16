// Judges for media runs: word error rate (speech to text), a round trip through a speech-to-text model
// (text to speech), and a vision judge from another model family (images, video). The model judges call
// OpenRouter through the endpoint contract (ctx = { key, fetchImpl, timeoutMs }), so tests run them against
// a stub with no key and no network. judge.mjs reads the key from the shell and passes it in.
//
//   wer(reference, hypothesis) → number
//   werVerdict(w, max) → { pass, detail }
//   sttRoundTrip(ctx, { sttModel, artifact, prompt, maxWer }) → { pass, detail, judgeModel, judgeCost }
//   visionJudge(ctx, { judges, candidate, artifact, questions }) → { pass, detail, judgeModel, judgeCost }
import { readFileSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import { MEDIA_CALLS } from './endpoints-media.mjs';

const API = 'https://openrouter.ai/api/v1';
// Media types for the data URL sent to the vision judge, by extension. Video goes as video_url, not image_url.
const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const VIDEO_TYPE = 'video/mp4';

// Top-level domains that make a preceding "dot" / "punto" / "point" a spoken dot in an address.
const TLDS = new Set(['org', 'com', 'it', 'net', 'io', 'eu']);
const SPOKEN_DOT = new Set(['dot', 'punto', 'point']);

// Lower case, punctuation removed (letters with accents and digits kept), split on spaces. Punctuation is
// removed rather than turned into a space, so "don't" and "dont" are the same word on both sides.
// A dot between two letters or digits (an address, "v0.11") becomes a space first, so "librivox.org" is two
// words, as a reader says it. The spoken-dot rule below is the only spoken-punctuation rule: a transcript that
// says "librivox punto org" for "librivox.org" must not cost errors, but "dot" elsewhere stays a word.
export function words(text) {
  const split = String(text).toLowerCase()
    .replace(/(?<=[\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/).filter(Boolean);
  return split.filter((w, i) => !(SPOKEN_DOT.has(w) && TLDS.has(split[i + 1])));
}

// Word-level Levenshtein distance: one row of the table at a time, which is all the last row needs.
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Word error rate: edits / reference words. An empty reference scores 0 only for an empty hypothesis.
export function wer(reference, hypothesis) {
  const ref = words(reference), hyp = words(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  return editDistance(ref, hyp) / ref.length;
}

export function werVerdict(w, max) {
  const shown = w.toFixed(2);
  return w <= max ? { pass: true, detail: `wer ${shown}` } : { pass: false, detail: `wer ${shown}, above max ${max}` };
}

// The first judge from another family than the candidate: "google/x" is judged by "qwen/j" but not "google/j".
const family = (model) => String(model).split('/')[0];
export function pickJudge(judges, candidate) {
  return judges.find((j) => family(j) !== family(candidate)) ?? null;
}

// The judge's call failed: no verdict, so the check is pending rather than a fail on the candidate.
const pendingFor = (model, error, cost = 0) => ({ pass: null, detail: `judge call failed: ${error}`, judgeModel: model, judgeCost: cost });

// One chat request with the judge's own key and the same data policy as the candidates.
async function chat(ctx, model, content) {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  let res;
  try {
    res = await fetchImpl(`${API}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower model-benchmark' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], provider: { data_collection: 'deny' } }),
      signal: AbortSignal.timeout(ctx.timeoutMs ?? 180_000),
    });
  } catch (e) {
    return { error: `no answer: ${e.name}` };
  }
  if (!res.ok) return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return { error: 'bad response: no message' };
  return { text, cost: data.usage?.cost ?? 0 };
}

// Text to speech: the artifact goes back through the transcriptions call, and its text is compared with the prompt.
// The transcription reads its audio from task.dir/task.audio, so the artifact's folder and name are passed as such.
export async function sttRoundTrip(ctx, { sttModel, artifact, prompt, maxWer }) {
  if (!artifact) return { pass: false, detail: 'no artifact to transcribe', judgeModel: sttModel, judgeCost: 0 };
  const r = await MEDIA_CALLS.transcriptions(
    { key: ctx.key, fetchImpl: ctx.fetchImpl, timeoutMs: ctx.timeoutMs },
    sttModel,
    { dir: dirname(artifact), audio: basename(artifact) },
  );
  if (r.error) return pendingFor(sttModel, r.error);
  return { ...werVerdict(wer(prompt, r.answer), maxWer), judgeModel: sttModel, judgeCost: r.cost ?? 0 };
}

// Images and video: one chat request with the questions and the media, asking for booleans in order.
// The expected answers never go to the judge; only the questions do.
export async function visionJudge(ctx, { judges, candidate, artifact, questions }) {
  const judge = pickJudge(judges, candidate);
  if (!judge) return { pass: null, detail: 'no judge from another family' };
  const ext = extname(artifact || '').slice(1).toLowerCase();
  const isVideo = ext === 'mp4';
  const type = isVideo ? VIDEO_TYPE : MEDIA_TYPES[ext];
  if (!type) return { pass: false, detail: `unsupported media for the vision judge: ${basename(artifact || '')}`, judgeModel: judge, judgeCost: 0 };
  const data = `data:${type};base64,${readFileSync(artifact).toString('base64')}`;
  const media = isVideo ? { type: 'video_url', video_url: { url: data } } : { type: 'image_url', image_url: { url: data } };
  const list = questions.map((q, i) => `${i + 1}. ${q.q}`).join('\n');
  const text = `Look at the attached ${isVideo ? 'video' : 'image'} and answer each question with true or false.\n${list}\n`
    + `Reply with a JSON array of ${questions.length} booleans, one per question, in order, and nothing else.`;
  const r = await chat(ctx, judge, [{ type: 'text', text }, media]);
  if (r.error) return pendingFor(judge, r.error);
  const got = parseBooleans(r.text);
  if (!got) return { pass: false, detail: `judge gave no boolean array: ${r.text.slice(0, 120)}`, judgeModel: judge, judgeCost: r.cost };
  const mismatches = questions
    .map((q, i) => (got[i] === q.a ? null : `question ${i + 1} "${q.q}": got ${got[i]}, want ${q.a}`))
    .filter(Boolean);
  const pass = !mismatches.length;
  return { pass, detail: pass ? `all ${questions.length} answers match` : mismatches.join('; '), judgeModel: judge, judgeCost: r.cost };
}

// The judge may wrap the array in prose or a fence: take the outermost brackets, then require booleans only.
function parseBooleans(text) {
  const m = /\[[\s\S]*\]/.exec(text);
  try {
    const v = JSON.parse(m?.[0] ?? '');
    return Array.isArray(v) && v.every((x) => typeof x === 'boolean') ? v : null;
  } catch {
    return null;
  }
}
