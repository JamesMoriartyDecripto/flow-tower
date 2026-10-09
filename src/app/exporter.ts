import { towerSvg, type Palette } from './exportSvg';
import { layoutOf } from './keynav';
import { requestSnapshot } from './scene/Snapshot';
import { useStore } from './store';

/** P / X and the PNG / SVG buttons: download the view on screen as an image or as an editable diagram. */

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tower';

function current() {
  const s = useStore.getState();
  const tower = s.workspace?.towers[s.stack[s.stack.length - 1]];
  const layer = s.focusedLayer !== undefined ? tower?.layers[s.focusedLayer] : undefined;
  return { tower, layer, name: tower ? `${slug(tower.name)}${layer ? `-${slug(layer.title)}` : ''}` : 'tower' };
}

function download(blob: Blob, file: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: file });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The active theme's colors, so the diagram matches what is on screen. */
function palette(): Palette {
  return { bg: css('--bg'), plate: css('--plate'), accent: css('--orange'), accent2: css('--amber'), text: css('--white'), dim: css('--dim') };
}

/**
 * PNG of the whole 3D view with a one-line caption. The HUD panels are DOM, not part of the canvas, so
 * the image also shows what sits under them on screen: nothing is cut.
 */
export async function exportPng() {
  const blob = await requestSnapshot();
  const canvas = document.querySelector('canvas');
  if (!blob || !canvas) return;
  const img = await createImageBitmap(blob);
  const k = img.width / canvas.clientWidth; // device pixels per CSS pixel
  const [sx, sy, sw, sh] = [0, 0, img.width, img.height];
  const caption = Math.round(34 * k);
  const out = Object.assign(document.createElement('canvas'), { width: sw, height: sh + caption });
  const g = out.getContext('2d');
  if (!g) return;
  g.fillStyle = css('--bg') || '#030a18';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const { tower, layer } = current();
  g.font = `600 ${Math.round(14 * k)}px Rajdhani, system-ui, sans-serif`;
  g.textBaseline = 'middle';
  g.fillStyle = css('--orange') || '#ff8a1f';
  g.fillText('FLOW//TOWER', Math.round(14 * k), sh + caption / 2);
  g.fillStyle = css('--white') || '#e8f1ff';
  const what = [tower?.name, layer ? `L${String(layer.index + 1).padStart(2, '0')} ${layer.title}` : 'Tower overview'].filter(Boolean).join('  ·  ');
  g.fillText(what, Math.round(120 * k), sh + caption / 2);
  out.toBlob((png) => png && download(png, `${current().name}.png`), 'image/png');
}

/** SVG of the focused layer, or of every layer stacked when none is focused. */
export function exportSvg() {
  const { tower, layer, name } = current();
  const layout = tower && layoutOf(tower.id);
  if (!tower || !layout) return;
  const svg = towerSvg(tower, layout, { layers: layer ? [layer.index] : undefined, palette: palette() });
  download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
}
