import { strToU8, zipSync, type Zippable } from 'fflate';
import { create } from 'zustand';
import rajdhani500 from '@fontsource/rajdhani/files/rajdhani-latin-500-normal.woff2?url';
import rajdhani700 from '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url';
import mono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import { layerFile, rasterScale, towerFolders, towerSvg, type Palette } from './exportSvg';
import { layoutTower } from './layout';
import { layoutOf } from './keynav';
import { requestSnapshot } from './scene/Snapshot';
import { useStore } from './store';

/**
 * P / X and the PNG / SVG buttons: a ZIP with every layer of the project as its own image, plus the map
 * of all layers, for the project tower and each sub-tower (in nested folders). PNGs are rasterized from
 * the same drawing as the SVGs at Full HD (the SVGs are the vector version for zooming in); the PNG pack also
 * holds the 3D view as it is on screen.
 */

/** What the export buttons show while a pack is being built. */
export const useExport = create<{ busy?: 'png' | 'svg'; done?: number; total?: number }>(() => ({}));

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

/** The UI fonts as data URLs: an SVG drawn as an image cannot load the page's fonts. */
let fonts: Promise<string> | undefined;
function fontCss() {
  const face = async (family: string, weight: number, url: string) => {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((done) => {
      const r = new FileReader();
      r.onload = () => done(String(r.result));
      r.readAsDataURL(blob);
    });
    return `@font-face{font-family:${family};font-weight:${weight};src:url(${data}) format('woff2')}`;
  };
  fonts ??= Promise.all([face('Rajdhani', 500, rajdhani500), face('Rajdhani', 700, rajdhani700), face("'JetBrains Mono'", 400, mono400)])
    .then((f) => f.join(''))
    .catch(() => '');
  return fonts;
}

async function rasterize(draw: (scale: number) => string): Promise<Uint8Array | undefined> {
  const size = /width="(\d+)" height="(\d+)"/.exec(draw(1));
  if (!size) return undefined;
  const k = rasterScale(Number(size[1]), Number(size[2]));
  const url = URL.createObjectURL(new Blob([draw(k)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    c.getContext('2d')?.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pack(kind: 'png' | 'svg') {
  const s = useStore.getState();
  const ws = s.workspace;
  if (!ws || !s.stack.length || useExport.getState().busy) return;
  useExport.setState({ busy: kind, done: 0, total: undefined });
  try {
    const files: Zippable = {};
    const folders = towerFolders(ws, s.stack[0]);
    // The 3D view first: it shows the screen as it was when the export was asked for.
    if (kind === 'png') {
      const view = await snapshot();
      if (view) files[`${folders[0].dir}/view-3d.png`] = [view, { level: 0 }];
    }
    const p = palette();
    const css = kind === 'png' ? await fontCss() : undefined;
    const jobs: { path: string; draw(scale: number): string }[] = [];
    for (const { tower, dir } of folders) {
      const layout = layoutOf(tower.id) ?? (await layoutTower(tower));
      jobs.push({ path: `${dir}/00-map`, draw: (scale) => towerSvg(tower, layout, { arrange: 'map', palette: p, scale, css }) });
      for (const layer of tower.layers) {
        jobs.push({ path: `${dir}/${layerFile(layer)}`, draw: (scale) => towerSvg(tower, layout, { layers: [layer.index], palette: p, scale, css }) });
      }
    }
    useExport.setState({ total: jobs.length });
    const step = () => useExport.setState((e) => ({ done: (e.done ?? 0) + 1 }));
    if (kind === 'svg') {
      for (const j of jobs) files[`${j.path}.svg`] = [strToU8(j.draw(1)), { level: 6 }];
    } else {
      // PNG encoding dominates and runs off the main thread: a few at a time.
      let next = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < jobs.length) {
          const j = jobs[next++];
          const png = await rasterize(j.draw);
          if (png) files[`${j.path}.png`] = [png, { level: 0 }]; // already compressed
          step();
        }
      }));
    }
    download(new Blob([zipSync(files)], { type: 'application/zip' }), `${folders[0].dir}-${kind}.zip`);
  } finally {
    useExport.setState({ busy: undefined, done: undefined, total: undefined });
  }
}

/** The 3D view on screen (post-processing included) with a one-line caption. */
async function snapshot(): Promise<Uint8Array | undefined> {
  const blob = await requestSnapshot();
  const canvas = document.querySelector('canvas');
  if (!blob || !canvas) return undefined;
  const img = await createImageBitmap(blob);
  // Full HD at most, like the layers (a Retina screen captures at twice that).
  const fit = Math.min(1, 1920 / img.width, 1080 / (img.height * (1 + 34 / canvas.clientHeight)));
  const [w, h] = [Math.round(img.width * fit), Math.round(img.height * fit)];
  const k = w / canvas.clientWidth; // output pixels per CSS pixel
  const caption = Math.round(34 * k);
  const out = Object.assign(document.createElement('canvas'), { width: w, height: h + caption });
  const g = out.getContext('2d');
  if (!g) return undefined;
  g.fillStyle = css('--bg') || '#030a18';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(img, 0, 0, w, h);
  const s = useStore.getState();
  const tower = s.workspace?.towers[s.stack[s.stack.length - 1]];
  const layer = s.focusedLayer !== undefined ? tower?.layers[s.focusedLayer] : undefined;
  g.font = `600 ${Math.round(14 * k)}px Rajdhani, system-ui, sans-serif`;
  g.textBaseline = 'middle';
  g.fillStyle = css('--orange') || '#ff8a1f';
  g.fillText('FLOW//TOWER', Math.round(14 * k), h + caption / 2);
  g.fillStyle = css('--white') || '#e8f1ff';
  const what = [tower?.name, layer ? `L${String(layer.index + 1).padStart(2, '0')} ${layer.title}` : 'Tower overview'].filter(Boolean).join('  ·  ');
  g.fillText(what, Math.round(120 * k), h + caption / 2);
  const png = await new Promise<Blob | null>((done) => out.toBlob(done, 'image/png'));
  return png ? new Uint8Array(await png.arrayBuffer()) : undefined;
}

export const exportPng = () => pack('png');
export const exportSvg = () => pack('svg');
