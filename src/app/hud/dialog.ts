import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus for HUD dialogs: on open, remember where focus was and move it inside (to `first`, or the
 * dialog itself so PageDown scrolls it); Tab and Shift+Tab cycle inside; on close, focus goes back.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, first?: string) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      ((first && el?.querySelector<HTMLElement>(first)) || el)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      // The opener may be gone (e.g. a library card after opening a project): then the page keeps the focus.
      if (prev?.isConnected) prev.focus();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
