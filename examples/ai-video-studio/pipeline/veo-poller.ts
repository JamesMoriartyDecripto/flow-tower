// Async job poller for generation vendors. Video APIs return a job id; the result arrives
// seconds to minutes later (Veo 3.1: 11 s to 6 min at peak). The poller, not the agent, owns
// waiting, backoff and timeouts so the agent does not spend turns on "is it done yet?".
// Veo outputs are deleted after 2 days, so we download as soon as a job completes.
import { env } from 'node:process';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const LUMA = 'https://agents.lumalabs.ai/v1';

type Job = { vendor: 'veo' | 'luma'; id: string; shot: string; out: string };
type Poll = { done: boolean; url?: string; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollVeo(name: string): Promise<Poll> {
  const res = await fetch(`${GEMINI}/${name}`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY! } });
  if (res.status === 429 || res.status >= 500) return { done: false }; // transient: keep polling
  const op = await res.json();
  if (!op.done) return { done: false };
  if (op.error) return { done: true, error: op.error.message };
  const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
  // Blocked by safety filters: no sample and no charge; the shot director rephrases.
  return sample ? { done: true, url: sample.video.uri } : { done: true, error: 'blocked: no sample returned' };
}

async function pollLuma(id: string): Promise<Poll> {
  const res = await fetch(`${LUMA}/generations/${id}`, { headers: { Authorization: `Bearer ${env.LUMA_API_KEY}` } });
  if (res.status === 429 || res.status >= 500) return { done: false };
  const g = await res.json();
  if (g.state === 'completed') return { done: true, url: g.assets?.video };
  if (g.state === 'failed') return { done: true, error: `${g.failure_code}: ${g.failure_reason}` };
  return { done: false };
}

export async function waitFor(job: Job, timeoutMs = 10 * 60_000): Promise<string> {
  const started = Date.now();
  // Veo docs poll every 10 s; Luma suggests waiting ~30 s before the first poll.
  let delay = job.vendor === 'luma' ? 30_000 : 10_000;
  while (Date.now() - started < timeoutMs) {
    await sleep(delay);
    const p = job.vendor === 'veo' ? await pollVeo(job.id) : await pollLuma(job.id);
    if (p.error) throw new Error(`${job.shot} ${job.vendor} ${job.id}: ${p.error}`);
    if (p.done && p.url) {
      await download(p.url, job.out, job.vendor === 'veo');
      console.log(JSON.stringify({ ts: new Date().toISOString(), shot: job.shot, vendor: job.vendor, job: job.id, status: 'done', secs: Math.round((Date.now() - started) / 1000) }));
      return job.out;
    }
    delay = Math.min(delay * 1.5, 60_000); // backoff, capped at one minute
  }
  throw new Error(`${job.shot} ${job.vendor} ${job.id}: timeout after ${timeoutMs / 1000}s`);
}

async function download(url: string, out: string, needsKey: boolean) {
  const res = await fetch(url, { headers: needsKey ? { 'x-goog-api-key': env.GEMINI_API_KEY! } : {}, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} for ${out}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(out));
}
