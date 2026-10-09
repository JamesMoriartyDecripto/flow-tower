import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store';

/**
 * PNG snapshot of the 3D view, post-processing included. The WebGL drawing buffer is only valid in the
 * frame that drew it (no preserveDrawingBuffer, which would cost every frame), so the capture runs as a
 * frame callback after the composer (priority 1) and reads the canvas there. Mounted only while a
 * snapshot is pending: a priority callback takes over rendering from react-three-fiber.
 */

let pending: ((blob: Blob | null) => void) | undefined;
let wake: (() => void) | undefined;

export function requestSnapshot(): Promise<Blob | null> {
  return new Promise((resolve) => {
    pending = resolve;
    if (wake) wake();
    else { pending = undefined; resolve(null); }
  });
}

export function Snapshot() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    wake = () => setActive(true);
    return () => { wake = undefined; };
  }, []);
  return active ? <Capture done={() => setActive(false)} /> : null;
}

function Capture({ done }: { done(): void }) {
  const invalidate = useThree((s) => s.invalidate);
  // eco has no composer: then nothing else draws while this callback is mounted, so it draws itself.
  const composer = useStore((s) => s.quality !== 'eco');
  useEffect(() => { invalidate(); }, [invalidate]);
  useFrame((state) => {
    const resolve = pending;
    if (!resolve) return done();
    pending = undefined;
    if (!composer) state.gl.render(state.scene, state.camera);
    state.gl.domElement.toBlob(resolve, 'image/png');
    done();
  }, 2);
  return null;
}
