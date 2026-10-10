import { create } from 'zustand';
import { useLive } from './live';
import { useStore, type Quality } from './store';
import { applyTheme, themeById } from './themes';
import type { FlowLook } from './scene/Particles';

export type DefaultView = 'tower' | 'map' | 'auto';
export type VoiceLanguage = 'auto' | 'it' | 'en';
export type VoiceSensitivity = 'low' | 'normal' | 'high';
export type TextFont = 'hud' | 'system';
export type TitleFont = 'display' | 'text';

/** Animated flow along edges inside a layer (nodes) or along links between layers. */
export interface Flow extends FlowLook { on: boolean }

/** What is drawn by default; everything can still be toggled from Settings. */
export interface Visibility {
  edgeLabels: boolean;
  nodeTags: boolean;
  links: boolean;
  grid: boolean;
  base: boolean;
  scanner: boolean;
  sparkles: boolean;
  pillars: boolean;
}

export const DEFAULT_FLOW_NODES: Flow = { on: true, style: 'dots', size: 1, speed: 1, density: 1 };
export const DEFAULT_FLOW_LAYERS: Flow = { on: true, style: 'comets', size: 1, speed: 0.8, density: 1 };
export const DEFAULT_VISIBILITY: Visibility = {
  edgeLabels: true, nodeTags: true, links: true, grid: true, base: true, scanner: true, sparkles: true, pillars: true,
};

/** Viewer preferences that only live in this browser (settings page). */
interface Prefs {
  theme: string;
  /** Bloom strength multiplier (0 = off). */
  bloom: number;
  /** Opacity of the layer glass plates (0.1 = see-through, 0.95 = solid). */
  plateOpacity: number;
  flowNodes: Flow;
  flowLayers: Flow;
  show: Visibility;
  chips: boolean;
  hints: boolean;
  /** File viewer: wrap long lines; show Markdown as source instead of formatted. */
  viewerWrap: boolean;
  markdownSource: boolean;
  defaultView: DefaultView;
  /** Spoken language of voice commands: a hint for transcription, or detect it from each clip. */
  voiceLanguage: VoiceLanguage;
  /** The agent speaks its answers (#63); off: they are only shown in the caption. */
  voiceReplies: boolean;
  /** Keep a local journal of voice turns and learn from it (#68). Off by default: consent first. */
  voiceJournal: boolean;
  /** Words heard while a reply plays cut it short. Off (default): laptop speakers leak into the mic. */
  voiceBargeIn: boolean;
  /** How readily the mic takes a sound for speech (voice/noise.ts). Low for noisy laptops (fans). */
  voiceSensitivity: VoiceSensitivity;
  /** HUD scale (text and panels together), for small laptops up to 4K screens. */
  uiScale: number;
  textFont: TextFont;
  titleFont: TitleFont;
  /** Bumped when the theme changes: the scene remounts to pick up new colors. */
  themeRev: number;
  open: boolean;
  /** Keyboard shortcuts overlay (not saved). */
  help: boolean;
  set(patch: Partial<Omit<Prefs, 'set' | 'setTheme' | 'themeRev'>>): void;
  setTheme(id: string): void;
}

const KEY = 'flow-tower:prefs';

interface Saved {
  theme?: string; bloom?: number; plateOpacity?: number; flowNodes?: Partial<Flow>; flowLayers?: Partial<Flow>; show?: Partial<Visibility>; chips?: boolean; hints?: boolean; viewerWrap?: boolean; markdownSource?: boolean; defaultView?: DefaultView; voiceLanguage?: VoiceLanguage; voiceReplies?: boolean; voiceJournal?: boolean; voiceBargeIn?: boolean; voiceSensitivity?: VoiceSensitivity; uiScale?: number; textFont?: TextFont; titleFont?: TitleFont;
  quality?: Quality; animations?: boolean; particles?: boolean; explode?: number; spotlight?: boolean; follow?: boolean;
}

function load(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; }
}

const saved = load();

export const usePrefs = create<Prefs>()((set, get) => ({
  theme: saved.theme ?? 'mark',
  bloom: saved.bloom ?? 1,
  plateOpacity: saved.plateOpacity ?? 0.42,
  flowNodes: { ...DEFAULT_FLOW_NODES, ...saved.flowNodes },
  flowLayers: { ...DEFAULT_FLOW_LAYERS, ...saved.flowLayers },
  show: { ...DEFAULT_VISIBILITY, ...saved.show },
  chips: saved.chips ?? true,
  hints: saved.hints ?? true,
  viewerWrap: saved.viewerWrap ?? false,
  markdownSource: saved.markdownSource ?? false,
  defaultView: saved.defaultView ?? 'auto',
  voiceLanguage: saved.voiceLanguage ?? 'auto',
  voiceReplies: saved.voiceReplies ?? true,
  voiceJournal: saved.voiceJournal ?? false,
  voiceBargeIn: saved.voiceBargeIn ?? false,
  voiceSensitivity: saved.voiceSensitivity ?? 'normal',
  uiScale: saved.uiScale ?? 1,
  textFont: saved.textFont ?? 'hud',
  titleFont: saved.titleFont ?? 'display',
  themeRev: 0,
  open: false,
  help: false,
  set: (patch) => set(patch),
  setTheme(id) {
    applyTheme(themeById(id));
    set({ theme: id, themeRev: get().themeRev + 1 });
  },
}));

/**
 * The user's explicit choice of view. It becomes the default, so nested towers and other projects
 * open the same way (Map stays Map inside sub-towers, Tower stays Tower). Saved with the preferences.
 */
export function chooseView(view: 'tower' | 'map') {
  usePrefs.getState().set({ defaultView: view });
  useStore.getState().set({ view });
  useStore.getState().resetView();
}

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
      theme: p.theme, bloom: p.bloom, plateOpacity: p.plateOpacity, flowNodes: p.flowNodes, flowLayers: p.flowLayers, show: p.show, chips: p.chips, hints: p.hints, viewerWrap: p.viewerWrap, markdownSource: p.markdownSource, defaultView: p.defaultView, voiceLanguage: p.voiceLanguage, voiceReplies: p.voiceReplies, voiceJournal: p.voiceJournal, voiceBargeIn: p.voiceBargeIn, voiceSensitivity: p.voiceSensitivity, uiScale: p.uiScale, textFont: p.textFont, titleFont: p.titleFont,
      quality: ui.quality, animations: ui.animations, particles: ui.particles, explode: ui.explode,
      spotlight: live.spotlight, follow: live.follow,
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* not persisted */ }
  };
  applyTypography();
  window.addEventListener('resize', applyTypography);
  usePrefs.subscribe((p, prev) => {
    if (p.uiScale !== prev.uiScale || p.textFont !== prev.textFont || p.titleFont !== prev.titleFont) applyTypography();
  });
  usePrefs.subscribe(save);
  useStore.subscribe((s, prev) => {
    if (s.quality !== prev.quality || s.animations !== prev.animations || s.particles !== prev.particles || s.explode !== prev.explode) save();
  });
  useLive.subscribe((s, prev) => { if (s.spotlight !== prev.spotlight || s.follow !== prev.follow) save(); });
}

const FONTS = {
  hud: "'Rajdhani', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  display: "'Orbitron', sans-serif",
};

/** Smallest window, in HUD pixels, where every panel fits side by side (measured at 1280×720 / 1440×900). */
const FIT = { w: 1180, h: 620 };

/** The scale actually applied: the chosen one, capped so the panels still fit this window. */
export function effectiveScale(scale = usePrefs.getState().uiScale) {
  return Math.max(0.7, Math.min(scale, innerWidth / FIT.w, innerHeight / FIT.h));
}

/** Fonts and HUD scale are CSS variables: the HUD restyles without re-rendering anything. */
function applyTypography() {
  const { textFont, titleFont } = usePrefs.getState();
  const root = document.documentElement.style;
  root.setProperty('--ui-scale', effectiveScale().toFixed(3));
  root.setProperty('--ui', FONTS[textFont]);
  root.setProperty('--display', titleFont === 'display' ? FONTS.display : FONTS[textFont]);
}

export function resetPrefs() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  location.reload();
}
