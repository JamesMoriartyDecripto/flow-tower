import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore, type Quality } from '../store';

/**
 * On-demand rendering. The canvas runs with frameloop="demand": nothing is drawn unless something
 * changed. Interactions invalidate by themselves (React props, camera controls); timed animations
 * call keepAlive(); decorative animations (particles, scanner…) keep a capped loop only when enabled.
 * Flow Tower usually runs next to busy agents, so an idle tower must cost (almost) nothing.
 */

let busyUntil = 0;

/** Keep rendering for at least `ms` (transitions, lens, live flashes). Safe to call every frame. */
export function keepAlive(ms = 250) {
  busyUntil = Math.max(busyUntil, performance.now() + ms);
}

const FPS: Record<Quality, number> = { eco: 20, balanced: 30, high: 60 };
const BACKGROUND_FPS = 10;

/** Whether decorative, always-moving effects are on for this quality / setting. */
export const decorative = (quality: Quality, animations: boolean) => animations && quality !== 'eco';

export function FrameDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const quality = useStore((s) => s.quality);
  const animations = useStore((s) => s.animations);

  useEffect(() => {
    let timer: number;
    const loop = () => {
      const focused = document.hasFocus() && document.visibilityState === 'visible';
      const continuous = (focused && decorative(quality, animations)) || performance.now() < busyUntil;
      if (continuous && document.visibilityState === 'visible') invalidate();
      timer = window.setTimeout(loop, 1000 / (focused ? FPS[quality] : BACKGROUND_FPS));
    };
    loop();
    // A resize clears the canvas: make sure it gets redrawn even when nothing else moves.
    const onResize = () => { keepAlive(600); invalidate(); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, [invalidate, quality, animations]);
  return null;
}
