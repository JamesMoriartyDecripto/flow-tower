import { create } from 'zustand';
import { useLive } from './live';
import { useStore, type Quality } from './store';
import { applyTheme, themeById } from './themes';

export type DefaultView = 'tower' | 'map' | 'auto';

/** Viewer preferences that only live in this browser (settings page). */
interface Prefs {
  theme: string;
  /** Bloom strength multiplier (0 = off). */
  bloom: number;
  chips: boolean;
  hints: boolean;
  defaultView: DefaultView;
  /** Bumped when the theme changes: the scene remounts to pick up new colors. */
  themeRev: number;
  open: boolean;
  set(patch: Partial<Omit<Prefs, 'set' | 'setTheme' | 'themeRev'>>): void;
  setTheme(id: string): void;
}

const KEY = 'flow-tower:prefs';

interface Saved {
  theme?: string; bloom?: number; chips?: boolean; hints?: boolean; defaultView?: DefaultView;
  quality?: Quality; animations?: boolean; particles?: boolean; explode?: number; spotlight?: boolean; follow?: boolean;
}

function load(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; }
}

const saved = load();

export const usePrefs = create<Prefs>()((set, get) => ({
  theme: saved.theme ?? 'mark',
  bloom: saved.bloom ?? 1,
  chips: saved.chips ?? true,
  hints: saved.hints ?? true,
  defaultView: saved.defaultView ?? 'auto',
  themeRev: 0,
  open: false,
  set: (patch) => set(patch),
  setTheme(id) {
    applyTheme(themeById(id));
    set({ theme: id, themeRev: get().themeRev + 1 });
  },
}));

/** Picks the view for a tower: explicit preference, or map for complex towers (more than 10 layers). */
export const viewFor = (pref: DefaultView, layers: number) => (pref === 'auto' ? (layers > 10 ? 'map' : 'tower') : pref);

/**
 * Restores saved preferences into the UI stores (URL parameters keep priority) and saves any
 * change back. Storage can be unavailable (private mode): everything still works, just not persisted.
 */
export function initPrefs() {
  const url = new URLSearchParams(location.search);
  applyTheme(themeById(usePrefs.getState().theme));
  useStore.getState().set({
    ...(saved.quality && !url.has('quality') ? { quality: saved.quality } : {}),
    ...(saved.animations !== undefined ? { animations: saved.animations } : {}),
    ...(saved.particles !== undefined ? { particles: saved.particles } : {}),
    ...(saved.explode !== undefined ? { explode: saved.explode } : {}),
  });
  useLive.getState().setOption({
    ...(saved.spotlight !== undefined ? { spotlight: saved.spotlight } : {}),
    ...(saved.follow !== undefined ? { follow: saved.follow } : {}),
  });

  const save = () => {
    const p = usePrefs.getState();
    const ui = useStore.getState();
    const live = useLive.getState();
    const data: Saved = {
      theme: p.theme, bloom: p.bloom, chips: p.chips, hints: p.hints, defaultView: p.defaultView,
      quality: ui.quality, animations: ui.animations, particles: ui.particles, explode: ui.explode,
      spotlight: live.spotlight, follow: live.follow,
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* not persisted */ }
  };
  usePrefs.subscribe(save);
  useStore.subscribe((s, prev) => {
    if (s.quality !== prev.quality || s.animations !== prev.animations || s.particles !== prev.particles || s.explode !== prev.explode) save();
  });
  useLive.subscribe((s, prev) => { if (s.spotlight !== prev.spotlight || s.follow !== prev.follow) save(); });
}

export function resetPrefs() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  location.reload();
}
