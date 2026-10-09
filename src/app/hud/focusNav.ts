/**
 * Keyboard focus inside HUD panels. Once focus is in a panel, arrows stay in it:
 * ↑ ↓ (Home / End) walk its sections and buttons in reading order, ← → switch tabs, Esc returns
 * to the scene. Sections are stops too (tabIndex -1), so plain information scrolls into view.
 */

const PANELS = '.inspector, .layernav, .livefeed, .viewer, .legend, .issues';
const STOPS = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"]), .section';
const TABS = '.tabs, .legend-tabs, .files';

export const panelOf = (el: Element | null) => el?.closest<HTMLElement>(PANELS) ?? null;

function visible(el: HTMLElement) {
  return el.offsetParent !== null && !el.closest('[hidden]');
}

/** Puts the focus into the node panel, on its active tab. */
export function focusInspector() {
  const tab = document.querySelector<HTMLElement>('.inspector .tabs button.on') ?? document.querySelector<HTMLElement>('.inspector .section');
  tab?.focus();
}

/** Arrow keys inside a panel. Returns true when the key was handled. */
export function panelKey(panel: HTMLElement, e: KeyboardEvent): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (panel.matches('.viewer')) return viewerKey(panel, e);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const step = e.key === 'ArrowRight' ? 1 : -1;
    if (panel.matches('.inspector')) {
      window.dispatchEvent(new CustomEvent('flow-tower:tab', { detail: step }));
      return true;
    }
    const bar = active?.closest<HTMLElement>(TABS);
    if (bar) {
      const tabs = [...bar.querySelectorAll<HTMLElement>('button:not(:disabled)')];
      const next = tabs[(tabs.indexOf(active!) + step + tabs.length) % tabs.length];
      next?.focus();
      next?.click();
    } else {
      // A row with several buttons (e.g. sub-tower: select | enter): ← → move along the row.
      const row = [...(active?.parentElement?.querySelectorAll<HTMLElement>(':scope > button') ?? [])];
      if (row.length > 1) row[Math.min(row.length - 1, Math.max(0, row.indexOf(active!) + step))]?.focus();
    }
    return true; // never leak ← → to the scene while a panel has the focus
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return false;
  const stops = [...panel.querySelectorAll<HTMLElement>(STOPS)].filter(visible);
  if (!stops.length) return true;
  // Exact stop first: a section also *contains* its buttons.
  const exact = stops.indexOf(active!);
  const i = exact >= 0 ? exact : stops.findIndex((s) => s.contains(active));
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? stops.length - 1
    : Math.min(stops.length - 1, Math.max(0, (i < 0 ? -1 : i) + (e.key === 'ArrowDown' ? 1 : -1)));
  stops[next].focus();
  stops[next].scrollIntoView({ block: 'nearest' });
  return true;
}

/** File viewer: ← → switch files, ↑ ↓ PageUp PageDown Home End scroll the code, wherever the focus is inside. */
function viewerKey(panel: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const tabs = [...panel.querySelectorAll<HTMLElement>('.files button')];
    const i = tabs.findIndex((t) => t.classList.contains('on'));
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next?.click();
    next?.focus();
    return true;
  }
  const code = panel.querySelector<HTMLElement>('.code');
  const page = (code?.clientHeight ?? 400) * 0.9;
  const by: Record<string, number> = { ArrowDown: 48, ArrowUp: -48, PageDown: page, PageUp: -page, ' ': page };
  if (e.key === 'Home' || e.key === 'End') code?.scrollTo({ top: e.key === 'Home' ? 0 : code.scrollHeight });
  else if (e.key in by) code?.scrollBy({ top: by[e.key] });
  else return false;
  return true;
}
