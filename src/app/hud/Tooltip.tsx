import { useEffect, useRef, useState } from 'react';

const DELAY_MS = 350;

/**
 * One HUD-styled tooltip for the whole app. Any element with a `title` gets it: on hover the title
 * moves to `data-tip` (so the native grey tooltip does not also appear) and is shown here after a
 * short delay. Disabled elements keep their native title (browsers send them no mouse events).
 */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean }>();
  const timer = useRef<number>(undefined);
  const anchor = useRef<HTMLElement | null>(null);

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
        const above = r.bottom + 60 > window.innerHeight;
        // The tip is zoomed with the HUD (--ui-scale): its left/top are in zoomed pixels.
        const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
        const x = Math.min(Math.max(r.left + r.width / 2, 160), window.innerWidth - 160);
        setTip({ text, x: x / k, y: (above ? r.top - 8 : r.bottom + 8) / k, above });
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
  return (
    <div className={`hud-tip ${tip.above ? 'above' : ''}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  );
}
