import { useEffect } from 'react';
import { layoutOf } from './keynav';
import { SNAP_MESSAGE, type SnapMessage } from './snapMessage';
import { requestSnapshot } from './scene/Snapshot';
import { useStore } from './store';

/**
 * The snapshot page: `?snap=1&tower=<id>&view=tower` renders only the 3D tower and posts its PNG to the parent
 * document (the doc view builds its 3D figures from these frames, one iframe at a time).
 */

const TIMEOUT_MS = 20_000;
// The camera move and the lens take about a second (smoothTime 0.35 s): wait for them to settle, so the
// PNG is the same on every run instead of catching the tower mid-assembly.
const SETTLE_MS = 1500;

/** The tower id of a snapshot page, or undefined when the URL is not one. */
export function snapTowerOf(search: string): string | undefined {
  const q = new URLSearchParams(search);
  return q.get('snap') === '1' ? (q.get('tower') ?? '') : undefined;
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((done, fail) => {
  const r = new FileReader();
  r.onload = () => done(String(r.result));
  r.onerror = () => fail(r.error ?? new Error('could not read the image'));
  r.readAsDataURL(blob);
});

/** Frames the tower as the overview does, then posts the snapshot (or why it failed) to the parent. */
export function useSnapshotPost(towerId: string | undefined) {
  useEffect(() => {
    if (towerId === undefined) return;
    let done = false;
    const post = (msg: Omit<SnapMessage, 'type' | 'tower'>) => {
      done = true;
      window.parent.postMessage({ type: SNAP_MESSAGE, tower: towerId, ...msg }, location.origin);
    };
    const fail = (error: string) => { if (!done) post({ error } as Omit<SnapMessage, 'type' | 'tower'>); };
    // A deterministic frame: no auto-orbit, no decorative motion, the overview camera.
    useStore.getState().set({ autoRotate: false, animations: false, particles: false, explode: 1 });
    useStore.getState().resetView();
    const timer = setTimeout(() => fail(`timed out after ${TIMEOUT_MS / 1000} s`), TIMEOUT_MS);

    const capture = async () => {
      const blob = await requestSnapshot();
      if (done) return;
      // requestSnapshot resolves null when no WebGL canvas is mounted to draw it.
      if (!blob) return fail('no WebGL: the 3D view could not be drawn');
      const png = await blobToDataUrl(blob);
      clearTimeout(timer);
      post({ png } as Omit<SnapMessage, 'type' | 'tower'>);
    };
    // Layout is published by the scene once ELK has run: poll for it, then let the camera settle.
    const ready = () => {
      if (done) return;
      if (!layoutOf(towerId)) return void setTimeout(ready, 100);
      setTimeout(() => void capture().catch((e: Error) => fail(e.message)), SETTLE_MS);
    };
    ready();
    return () => { done = true; clearTimeout(timer); };
  }, [towerId]);
}
