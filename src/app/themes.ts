import { COLORS, GLOW, HOT, LIVE } from './theme';

export interface Theme {
  id: string;
  name: string;
  bg: string;
  plate: string;
  /** Structure accent (outlines, flows) and its lighter companion (tags, labels). */
  accent: string;
  accent2: string;
  text: string;
  dim: string;
  /** Live states must stay distinguishable from the accent in every theme. */
  live: { run: string; done: string; error: string };
}

export const THEMES: Theme[] = [
  {
    id: 'mark', name: 'Mark (orange)', bg: '#030a18', plate: '#0a1f3f', accent: '#ff8a1f', accent2: '#ffb347',
    text: '#e8f1ff', dim: '#7f93b5', live: { run: '#3ee6ff', done: '#5cff9d', error: '#ff4d5e' },
  },
  {
    id: 'arc', name: 'Arc reactor (cyan)', bg: '#02101a', plate: '#06283a', accent: '#36d6ff', accent2: '#8ef0ff',
    text: '#e6fbff', dim: '#6f9bb0', live: { run: '#ffb347', done: '#7dffa8', error: '#ff4d6a' },
  },
  {
    id: 'stealth', name: 'Stealth (white)', bg: '#07090d', plate: '#161b24', accent: '#d9e2f2', accent2: '#9fb0c8',
    text: '#ffffff', dim: '#6b7687', live: { run: '#3ee6ff', done: '#5cff9d', error: '#ff4d5e' },
  },
  {
    id: 'ember', name: 'Ember (red)', bg: '#0f0507', plate: '#2a0e12', accent: '#ff4d3d', accent2: '#ff9a5c',
    text: '#ffeee8', dim: '#a07f7a', live: { run: '#3ee6ff', done: '#5cff9d', error: '#ffd23e' },
  },
  {
    id: 'verdant', name: 'Verdant (green)', bg: '#03100b', plate: '#0a2a1d', accent: '#3dff9a', accent2: '#b5ff6b',
    text: '#eafff3', dim: '#7aa894', live: { run: '#ffb347', done: '#3ee6ff', error: '#ff4d5e' },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/**
 * Applies a theme to the shared 3D color objects (mutated in place: edge styles and materials hold
 * references to them) and to the HUD CSS variables. The scene is remounted by the caller.
 */
export function applyTheme(t: Theme) {
  Object.assign(COLORS, { bg: t.bg, plate: t.plate, orange: t.accent, amber: t.accent2, white: t.text, dim: t.dim });
  Object.assign(LIVE, t.live);
  GLOW.orange.set(t.accent).multiplyScalar(1.25);
  GLOW.amber.set(t.accent2).multiplyScalar(1.05);
  GLOW.white.set(t.text).multiplyScalar(0.8);
  GLOW.run.set(t.live.run).multiplyScalar(2.4);
  GLOW.done.set(t.live.done).multiplyScalar(2);
  GLOW.error.set(t.live.error).multiplyScalar(3.6);
  HOT.orange.set(t.accent).multiplyScalar(2.6);
  HOT.amber.set(t.accent2).multiplyScalar(2.2);
  HOT.white.set(t.text).multiplyScalar(1.7);

  const css = document.documentElement.style;
  const vars: Record<string, string> = {
    '--bg': t.bg, '--plate': t.plate, '--orange': t.accent, '--amber': t.accent2, '--white': t.text, '--dim': t.dim,
    '--live-run': t.live.run, '--live-done': t.live.done, '--live-error': t.live.error,
    '--line': `color-mix(in srgb, ${t.accent} 32%, transparent)`,
    '--glow': `0 0 10px color-mix(in srgb, ${t.accent} 55%, transparent)`,
  };
  for (const [k, v] of Object.entries(vars)) css.setProperty(k, v);
}
