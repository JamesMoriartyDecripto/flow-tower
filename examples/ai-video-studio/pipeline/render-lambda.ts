// Renders one platform cut of the editor's timeline on Remotion Lambda. Chunks render in
// parallel and are stitched in S3; completion arrives on the webhook (pipeline/webhooks.ts).
// getRenderProgress is the fallback when a webhook is missed.
// Licence: companies of 4+ people need a Remotion company licence (automators: per render).
import { env } from 'node:process';
import { readFileSync } from 'node:fs';
import { getRenderProgress, renderMediaOnLambda } from '@remotion/lambda/client';

const region = 'eu-central-1';
const functionName = env.REMOTION_FUNCTION_NAME!; // e.g. remotion-render-4-0-x-mem3008mb-disk10240mb-900sec
const serveUrl = env.REMOTION_SERVE_URL!; // deployed site with the ShortVideo composition

export async function renderCut(timelineFile: string, cut: 'short-916' | 'long-169' | 'paid-11') {
  const inputProps = JSON.parse(readFileSync(timelineFile, 'utf8'));
  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: cut === 'long-169' ? 'LongVideo' : 'ShortVideo',
    inputProps,
    codec: 'h264',
    privacy: 'private',
    maxRetries: 1, // retries only flaky chunk errors
    framesPerLambda: 240, // 10 s of 24 fps per Lambda
    outName: `${inputProps.videoId}/${cut}.mp4`,
    webhook: {
      url: `${env.PUBLIC_HOOK_BASE}/hooks/remotion`,
      secret: env.REMOTION_WEBHOOK_SECRET!,
      customData: { videoId: inputProps.videoId, cut },
    },
  });
  console.log(JSON.stringify({ ts: new Date().toISOString(), step: 'render', cut, renderId, bucketName }));
  return { renderId, bucketName };
}

// Fallback poll: used when no webhook arrived 2 minutes after the expected finish.
export async function pollRender(renderId: string, bucketName: string, timeoutMs = 15 * 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const p = await getRenderProgress({ renderId, bucketName, functionName, region });
    if (p.fatalErrorEncountered) throw new Error(p.errors.map((e) => e.message).join('; '));
    if (p.done) return { url: p.outputFile, usd: p.costs.accruedSoFar };
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`render ${renderId} timed out`);
}
