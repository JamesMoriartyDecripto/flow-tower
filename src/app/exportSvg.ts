import type { EdgeKind } from '../core/schema';
import type { ResolvedLayer, ResolvedTower, Workspace } from '../core/types';
import { edgeText, type LayerLayout, type TowerLayout } from './layout';
import { mapGrid } from './scene/lens';
import { COLORS, EDGE_STYLE, NODE_STYLE, SCALE } from './theme';

/**
 * A flat, editable SVG of one layer or of a whole tower, drawn from the same ELK layout as the 3D scene:
 * node boxes, labels, type / model / runtime tags, edges with arrows, kinds and labels. Layers are stacked
 * top to bottom, or laid out in the same grid as the map view. Plain SVG (no scripts, no external assets)
 * so it opens in any editor or doc.
 */

export interface Palette { bg: string; plate: string; accent: string; accent2: string; text: string; dim: string }

export const DEFAULT_PALETTE: Palette = {
  bg: COLORS.bg, plate: COLORS.plate, accent: COLORS.orange, accent2: COLORS.amber, text: COLORS.white, dim: COLORS.dim,
};

const PAD = 32;
const TITLE_H = 64;
const GAP = 36;
const UI = "Rajdhani, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Truncates to roughly what fits in `px` at `charPx` per character. */
const fit = (s: string, px: number, charPx: number) => {
  const max = Math.max(3, Math.floor(px / charPx));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function edgeColor(kind: EdgeKind, p: Palette) {
  return kind === 'call' || kind === 'return' || kind === 'data' ? p.text : kind === 'spawn' ? p.accent2 : p.accent;
}

/** One layer: title, frame, edges, nodes; its frame is `width` wide with the top-left corner at (x0, y0). */
function drawLayer(layer: ResolvedLayer, ll: LayerLayout, x0: number, y0: number, width: number, p: Palette): string[] {
  // World units back to ELK pixels (the layout was scaled by SCALE).
  const px = (v: number) => v / SCALE;
  const w = px(ll.width);
  const h = px(ll.depth);
  const ox = x0 + (width - w) / 2;
  const oy = y0 + TITLE_H;
  const X = (x: number) => ox + px(x + ll.width / 2);
  const Y = (z: number) => oy + px(z + ll.depth / 2);
  const label = `L${String(layer.index + 1).padStart(2, '0')}`;
  const parts: string[] = [];

  parts.push(`<g class="layer" id="layer-${esc(layer.id)}">`);
  parts.push(`<text x="${x0}" y="${y0 + 22}" font-family="${MONO}" font-size="14" fill="${p.accent}">${label}</text>`);
  parts.push(`<text x="${x0 + 44}" y="${y0 + 22}" font-family="${UI}" font-size="20" font-weight="700" fill="${p.text}">${esc(layer.title)}</text>`);
  if (layer.description) parts.push(`<text x="${x0 + 44}" y="${y0 + 42}" font-family="${UI}" font-size="13" fill="${p.dim}">${esc(fit(layer.description, width - 44, 6.2))}</text>`);
  parts.push(`<rect x="${x0}" y="${oy - 12}" width="${width}" height="${h + 24}" rx="6" fill="none" stroke="${p.accent}" stroke-opacity="0.35"/>`);

  for (const e of ll.edges) {
    const style = EDGE_STYLE[e.kind];
    const color = edgeColor(e.kind, p);
    const d = e.points.map(([x, z], k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(z).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${Math.max(1, style.width).toFixed(1)}"${style.dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow-${e.kind})"/>`);
    const text = edgeText(e);
    if (text) {
      // On the longest segment, like the 3D labels.
      let best = 0;
      let at: [number, number] = e.points[0];
      for (let k = 1; k < e.points.length; k++) {
        const [ax, az] = e.points[k - 1];
        const [bx, bz] = e.points[k];
        const len = Math.hypot(bx - ax, bz - az);
        if (len > best) { best = len; at = [(ax + bx) / 2, (az + bz) / 2]; }
      }
      parts.push(`<text x="${X(at[0]).toFixed(1)}" y="${(Y(at[1]) - 5).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="10" fill="${p.accent2}">${esc(fit(text, 160, 6))}</text>`);
    }
  }

  for (const n of layer.nodes) {
    const b = ll.nodes[n.key];
    if (!b) continue;
    const x = X(b.x - b.w / 2);
    const top = Y(b.z - b.d / 2);
    const bw = px(b.w);
    const bh = px(b.d);
    const stroke = n.status === 'deprecated' ? p.dim : n.status === 'active' ? p.accent : p.accent2;
    const tags = [n.tower && '⇣ SUB', n.status !== 'active' && n.status.toUpperCase(), NODE_STYLE[n.type].tag, n.model?.replace(/^claude-/, ''), n.runtime && `@${n.runtime.id}`]
      .filter(Boolean).join(' · ');
    parts.push(`<g class="node" id="${esc(n.key)}">`);
    parts.push(`<title>${esc(`${n.label}${n.description ? ` — ${n.description}` : ''}`)}</title>`);
    parts.push(`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${p.plate}" stroke="${stroke}" stroke-width="1.4"${n.status === 'active' ? '' : ' stroke-dasharray="5 3"'}/>`);
    parts.push(`<rect x="${(x + 2).toFixed(1)}" y="${(top + 4).toFixed(1)}" width="3" height="${(bh - 8).toFixed(1)}" fill="${p.accent}"/>`);
    parts.push(`<text x="${(x + 14).toFixed(1)}" y="${(top + 26).toFixed(1)}" font-family="${UI}" font-size="16" font-weight="700" fill="${p.text}">${esc(fit(n.label, bw - 22, 8.2))}</text>`);
    parts.push(`<text x="${(x + 14).toFixed(1)}" y="${(top + 46).toFixed(1)}" font-family="${MONO}" font-size="10" fill="${p.accent2}">${esc(fit(tags, bw - 22, 6.1))}</text>`);
    parts.push('</g>');
  }
  parts.push('</g>');
  return parts;
}

export interface SvgOptions {
  /** Layer indexes to draw (default: all). */
  layers?: number[];
  /** `stack`: top to bottom (default). `map`: the grid of the map view. */
  arrange?: 'stack' | 'map';
  palette?: Palette;
  /** Pixel size multiplier (the drawing keeps its viewBox): for rasterizing in high definition. */
  scale?: number;
  /** Extra CSS inside <defs> (embedded @font-face for rasterizing: an SVG image cannot load page fonts). */
  css?: string;
}

/** Height of a layer cell: title, frame and its padding. */
const cellH = (ll: LayerLayout) => TITLE_H + ll.depth / SCALE + 12;

export function towerSvg(tower: ResolvedTower, layout: TowerLayout, opts: SvgOptions = {}): string {
  const p = opts.palette ?? DEFAULT_PALETTE;
  const drawn = (opts.layers ?? tower.layers.map((l) => l.index))
    .map((i) => ({ layer: tower.layers[i], ll: layout.layers[i] }))
    .filter((d): d is { layer: ResolvedLayer; ll: LayerLayout } => Boolean(d.layer && d.ll));
  const cellW = Math.max(480, ...drawn.map((d) => d.ll.width / SCALE));
  const parts: string[] = [];
  let width: number;
  let height: number;

  if (opts.arrange === 'map' && drawn.length > 1) {
    // Same column count as the 3D map view, so the export reads like the screen.
    const { cols } = mapGrid(drawn.length, Math.max(...drawn.map((d) => d.ll.width)), Math.max(...drawn.map((d) => d.ll.depth)));
    let y = PAD;
    for (let r = 0; r < drawn.length; r += cols) {
      const row = drawn.slice(r, r + cols);
      row.forEach((d, c) => parts.push(...drawLayer(d.layer, d.ll, PAD + c * (cellW + GAP), y, cellW, p)));
      y += Math.max(...row.map((d) => cellH(d.ll))) + GAP;
    }
    width = PAD * 2 + cols * cellW + (cols - 1) * GAP;
    height = y - GAP + PAD;
  } else {
    let y = PAD;
    for (const d of drawn) {
      parts.push(...drawLayer(d.layer, d.ll, PAD, y, cellW, p));
      y += cellH(d.ll) + GAP;
    }
    width = cellW + PAD * 2;
    height = y - GAP + PAD;
  }

  const markers = (Object.keys(EDGE_STYLE) as EdgeKind[]).map((k) =>
    `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${edgeColor(k, p)}"/></marker>`).join('');
  const title = `${tower.name}${drawn.length === 1 ? ` — ${drawn[0].layer.title}` : ''}`;
  const k = opts.scale ?? 1;
  const [W, H] = [width.toFixed(0), height.toFixed(0)];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(width * k).toFixed(0)}" height="${(height * k).toFixed(0)}" viewBox="0 0 ${W} ${H}">`,
    `<title>${esc(title)}</title>`,
    `<defs>${opts.css ? `<style>${opts.css}</style>` : ''}${markers}</defs>`,
    `<rect width="100%" height="100%" fill="${p.bg}"/>`,
    ...parts,
    `<text x="${(width - PAD).toFixed(0)}" y="${(height - 10).toFixed(0)}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${p.dim}">${esc(tower.name)} · Flow Tower</text>`,
    '</svg>',
  ].join('\n');
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tower';

/**
 * A tower and every sub-tower reachable from it, each with a folder for the export: sub-towers nest
 * under the tower that opens them. A sub-tower shared by several nodes (or a cycle) is listed once.
 */
export function towerFolders(ws: Workspace, rootId: string): { tower: ResolvedTower; dir: string }[] {
  const root = ws.towers[rootId];
  if (!root) return [];
  const out = [{ tower: root, dir: slug(root.name) }];
  const seen = new Set([rootId]);
  for (let i = 0; i < out.length; i++) {
    const { tower, dir } = out[i];
    const used = new Set<string>();
    for (const n of tower.layers.flatMap((l) => l.nodes)) {
      const sub = n.tower ? ws.towers[n.tower] : undefined;
      if (!sub || seen.has(sub.id)) continue;
      seen.add(sub.id);
      let name = slug(sub.name);
      for (let k = 2; used.has(name); k++) name = `${slug(sub.name)}-${k}`;
      used.add(name);
      out.push({ tower: sub, dir: `${dir}/${name}` });
    }
  }
  return out;
}

/** "L03-review": file name of a layer, sorting in layer order. */
export const layerFile = (layer: ResolvedLayer) => `L${String(layer.index + 1).padStart(2, '0')}-${slug(layer.title)}`;

/** Full HD: the drawing scaled to fit 1920×1080 (the SVG is the vector version for zooming in). */
export const rasterScale = (w: number, h: number) => Math.min(1920 / w, 1080 / h);
