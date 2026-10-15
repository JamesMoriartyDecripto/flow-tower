import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { placeTip, TIP_MARGIN, type Box, type Placement } from './tipPlacement';

const DELAY_MS = 350;
// Longer texts get the wider column (see .hud-tip.long), so a long description is not a narrow strip.
const LONG_TEXT = 280;

/** The tip is zoomed with the HUD (--ui-scale): its left/top/arrow are in zoomed pixels. */
const uiScale = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;

type Placed = Placement & { capped: boolean };

/**
 * One HUD-styled tooltip for the whole app. Any element with a `title` gets it: on hover the title
 * moves to `data-tip` (so the native grey tooltip does not also appear) and is shown here after a
 * short delay. Disabled elements keep their native title (browsers send them no mouse events).
 */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; anchor: Box; placed?: Placed }>();
  const timer = useRef<number>(undefined);
  const anchor = useRef<HTMLElement | null>(null);
  const tipEl = useRef<HTMLDivElement>(null);

  // The tip is first drawn hidden at its natural size, measured, and only then placed: a guessed
  // position would show it cut off for a frame. Layout effects run before paint, so the user never sees that.
  useLayoutEffect(() => {
    const el = tipEl.current;
    if (!tip || tip.placed || !el) return;
    const r = el.getBoundingClientRect();
    const view = { w: window.innerWidth, h: window.innerHeight };
    const p = placeTip(tip.anchor, { w: r.width, h: r.height }, view);
    const k = uiScale();
    // Taller than the window even after widening: CSS caps it, so the tip must stay inside the cap.
    const placed: Placed = {
      left: p.left / k,
      top: p.top / k,
      side: p.side,
      arrow: p.arrow / k,
      capped: r.height > view.h - 2 * TIP_MARGIN,
    };
    setTip((t) => (t && !t.placed ? { ...t, placed } : t));
  }, [tip]);

  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[title],[data-tip]') as HTMLElement | null;
      if (!el || el.matches(':disabled')) return;
      // Keyboard users get the tip too, but only for keyboard focus (not after a click).
      if (e.type === 'focusin' && !el.matches(':focus-visible')) return;
      const title = el.getAttribute('title');
      if (title) {
        el.dataset.tip = title;
        el.removeAttribute('title');
        // The title was also the accessible name or description: keep it for screen readers.
        if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title);
        else if (!el.getAttribute('aria-description')) el.setAttribute('aria-description', title);
      }
      const text = el.dataset.tip;
      if (!text) return;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        anchor.current = el;
        watchdog ??= window.setInterval(check, 250);
        const r = el.getBoundingClientRect();
        setTip({ text, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
      }, DELAY_MS);
    };
    const hide = (e: MouseEvent) => {
      const from = (e.target as Element | null)?.closest?.('[data-tip]');
      const to = (e.relatedTarget as Element | null)?.closest?.('[data-tip]');
      if (from && from === to) return;
      clearTimeout(timer.current);
      setTip(undefined);
    };
    let watchdog: number | undefined;
    const reset = () => {
      clearTimeout(timer.current);
      clearInterval(watchdog);
      watchdog = undefined;
      anchor.current = null;
      setTip(undefined);
    };
    // Panels can close under the pointer (Esc, re-render): then no mouseout ever arrives.
    // Runs only while a tip is up: no idle wake-ups.
    const check = () => {
      const el = anchor.current;
      if (!el || !el.isConnected || (!el.matches(':hover') && el !== document.activeElement)) reset();
    };
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('mousedown', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearInterval(watchdog);
      window.removeEventListener('keydown', reset);
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('mouseout', hide);
      document.removeEventListener('mousedown', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);

  if (!tip) return null;
  const p = tip.placed;
  const classes = ['hud-tip'];
  if (p) classes.push(p.side);
  if (tip.text.length > LONG_TEXT) classes.push('long');
  if (p?.capped) classes.push('capped');
  const style = {
    left: p?.left ?? 0,
    top: p?.top ?? 0,
    '--arrow': `${p?.arrow ?? 0}px`,
    visibility: p ? undefined : 'hidden',
  } as CSSProperties;
  return (
    <div ref={tipEl} className={classes.join(' ')} style={style} role="tooltip">
      {tip.text}
    </div>
  );
}
