import { isSnapMessage, type SnapMessage } from '../snapMessage';
import { cropToContent } from './cropToContent';

/**
 * The 3D figures of the document. Each one is a snapshot page (`?snap=1`) of the app in a hidden same-origin
 * iframe. WebGL contexts are scarce, so the captures run strictly one at a time, in a queue, and a failed one
 * becomes a reason string, never a missing figure. A failed or timed-out attempt is retried in a fresh iframe,
 * so one bad load does not leave a placeholder in the printed document.
 */

export type Snapshot = { png: string } | { error: string };

const TIMEOUT_MS = 25_000; // the page itself gives up after 20 s; the margin covers the iframe load
const ATTEMPTS = 3; // the first try and two retries

let queue: Promise<unknown> = Promise.resolve();

/** Renders one tower's snapshot. Resolves with the framed PNG data URL, or the reason it could not be drawn. */
export function snapshotOf(towerId: string): Promise<Snapshot> {
  const job = queue.then(() => captureWithRetries(towerId));
  queue = job.catch(() => undefined);
  return job;
}

async function captureWithRetries(towerId: string): Promise<Snapshot> {
  let last: Snapshot = { error: 'not captured' };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await capture(towerId);
    if ('png' in last) {
      console.info(`3D snapshot of ${towerId}: attempt ${attempt} of ${ATTEMPTS} drawn`);
      return { png: await frame(towerId, last.png) };
    }
    console.warn(`3D snapshot of ${towerId}: attempt ${attempt} of ${ATTEMPTS} failed: ${last.error}`);
  }
  return last;
}

/** Crops the PNG to the tower. If cropping fails, the uncropped capture is still a good figure. */
async function frame(towerId: string, png: string): Promise<string> {
  try {
    return await cropToContent(png);
  } catch (e) {
    console.warn(`3D snapshot of ${towerId}: cropping failed, keeping the full frame`, e);
    return png;
  }
}

function capture(towerId: string): Promise<Snapshot> {
  return new Promise((resolve) => {
    const frame = Object.assign(document.createElement('iframe'), {
      // Eco quality: no post-processing, so software WebGL stays cheap. The fixed size keeps the PNGs consistent.
      src: `/?tower=${encodeURIComponent(towerId)}&view=tower&quality=eco&snap=1`,
    });
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1600px', height: '1000px', border: '0', visibility: 'hidden' });
    let settled = false;
    const finish = (result: Snapshot) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve(result);
    };
    const onMessage = (e: MessageEvent) => {
      // Only our own frame, from our own origin, may answer: anything else is not a snapshot.
      if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
      if (!isSnapMessage(e.data) || e.data.tower !== towerId) return;
      const msg: SnapMessage = e.data;
      finish('png' in msg ? { png: msg.png } : { error: msg.error });
    };
    // A page that never posts (a crash before the scene, a stale build) must not hold the queue forever.
    const timer = setTimeout(() => finish({ error: 'the snapshot page did not answer' }), TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    document.body.append(frame);
  });
}
