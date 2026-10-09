import { useEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import { keepAlive } from './frameBudget';

/** World units panned per wheel pixel, relative to the camera distance. */
const WHEEL_PAN = 0.0012;

/**
 * Shift turns the left button into pan (truck) and the trackpad two-finger scroll into pan too;
 * pinch-zoom (wheel + ctrlKey) keeps zooming. Shift is read from every event in the capture phase,
 * before camera-controls handles it, so it works even if Shift was pressed outside the window.
 */
export function useShiftPan(controls: RefObject<CameraControls | null>) {
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => {
    const actions = () => {
      const c = controls.current;
      return c ? { c, ACTION: (c.constructor as unknown as { ACTION: Record<string, number> }).ACTION } : undefined;
    };
    const setShift = (on: boolean) => {
      const a = actions();
      if (!a) return;
      a.c.mouseButtons.left = (on ? a.ACTION.TRUCK : a.ACTION.ROTATE) as typeof a.c.mouseButtons.left;
      a.c.mouseButtons.wheel = (on ? a.ACTION.NONE : a.ACTION.DOLLY) as typeof a.c.mouseButtons.wheel;
    };

    const onPointer = (e: PointerEvent) => { if (e.target === canvas) setShift(e.shiftKey); };
    const onWheel = (e: WheelEvent) => {
      if (e.target !== canvas) return; // let HUD panels scroll normally
      const panning = e.shiftKey && !e.ctrlKey;
      setShift(panning);
      const c = controls.current;
      if (!panning || !c) return;
      e.preventDefault();
      // Some platforms turn Shift+vertical wheel into a horizontal delta: honour whichever axis moved.
      const k = c.distance * WHEEL_PAN;
      c.truck(e.deltaX * k, e.deltaX && !e.deltaY ? 0 : e.deltaY * k, false);
      keepAlive(300); // on-demand canvas: render the pan
    };
    const onKey = (e: KeyboardEvent) => setShift(e.shiftKey);
    const onBlur = () => setShift(false);

    window.addEventListener('pointerdown', onPointer, { capture: true });
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [canvas, controls]);
}
