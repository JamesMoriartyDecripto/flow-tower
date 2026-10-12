import { isSnapMessage, type SnapMessage } from '../snapMessage';

/**
 * The 3D figures of the document. Each one is a snapshot page (`?snap=1`) of the app in a hidden same-origin
 * iframe. WebGL contexts are scarce, so the captures run strictly one at a time, in a queue, and a failed one
 * becomes a reason string, never a missing figure.
 */

export type Snapshot = { png: string } | { error: string };

const TIMEOUT_MS = 25_000; // the page itself gives up after 20 s; the margin covers the iframe load

let queue: Promise<unknown> = Promise.resolve();

/** Renders one tower's snapshot. Resolves with the PNG data URL, or the reason it could not be drawn. */
export function snapshotOf(towerId: string): Promise<Snapshot> {
  const job = queue.then(() => capture(towerId));
  queue = job.catch(() => undefined);
  return job;
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
