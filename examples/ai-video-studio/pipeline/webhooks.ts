// Webhook receiver for async renders: HeyGen (callback_url on avatar videos) and Remotion
// Lambda (webhook signed with HMAC SHA-512). Rule: answer 2xx fast, then do the work. Never
// trust a payload alone: re-read the job status from the vendor before marking a step done.
import { env } from 'node:process';
import { createServer } from 'node:http';
import { validateWebhookSignature } from '@remotion/lambda/client';

const HEYGEN = 'https://api.heygen.com';

// Wakes the pipeline step waiting on this job (a row in the orchestrator's job table).
async function resumeStep(step: 'avatar' | 'render', jobId: string, result: Record<string, unknown>) {
  await fetch(`${env.ORCHESTRATOR_URL}/jobs/${step}/${jobId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.ORCHESTRATOR_TOKEN}` },
    body: JSON.stringify(result),
  });
}

async function heygenStatus(videoId: string) {
  const res = await fetch(`${HEYGEN}/v3/videos/${videoId}`, { headers: { 'X-Api-Key': env.HEYGEN_API_KEY! } });
  if (!res.ok) throw new Error(`heygen status ${res.status}`);
  return (await res.json()).data as { status: string; video_url?: string; failure_code?: string; failure_message?: string };
}

createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  res.writeHead(204).end(); // acknowledge first; vendors retry slow or non-2xx answers

  try {
    const payload = JSON.parse(raw);
    if (req.url === '/hooks/heygen') {
      const videoId: string = payload.event_data?.video_id ?? payload.video_id;
      const job = await heygenStatus(videoId); // source of truth, not the callback body
      if (job.status === 'completed') await resumeStep('avatar', videoId, { url: job.video_url });
      if (job.status === 'failed') await resumeStep('avatar', videoId, { error: `${job.failure_code}: ${job.failure_message}` });
    } else if (req.url === '/hooks/remotion') {
      validateWebhookSignature({
        secret: env.REMOTION_WEBHOOK_SECRET!,
        body: payload,
        signatureHeader: String(req.headers['x-remotion-signature']),
      }); // throws on a bad signature
      if (payload.type === 'success') await resumeStep('render', payload.renderId, { url: payload.outputUrl, costs: payload.costs });
      else await resumeStep('render', payload.renderId, { error: payload.type, errors: payload.errors ?? [] }); // error | timeout
    }
  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), hook: req.url, error: String(err) }));
  }
}).listen(Number(env.PORT ?? 8080));
