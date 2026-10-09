import type { EdgeKind } from '../core/schema';
import type { ResolvedTower } from '../core/types';
import { edgeText, type TowerLayout } from './layout';
import { COLORS, EDGE_STYLE, NODE_STYLE, SCALE } from './theme';

/**
 * A flat, editable SVG of one layer or of the whole tower (layers stacked top to bottom), drawn from the
 * same ELK layout as the 3D scene: node boxes, labels, type / model / runtime tags, edges with arrows,
 * kinds and labels. Plain SVG (no scripts, no external assets) so it opens in any editor or doc.
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

export function towerSvg(tower: ResolvedTower, layout: TowerLayout, opts: { layers?: number[]; palette?: Palette } = {}): string {
  const p = opts.palette ?? DEFAULT_PALETTE;
  const indexes = opts.layers ?? tower.layers.map((l) => l.index);
  // World units back to ELK pixels (the layout was scaled by SCALE).
  const px = (v: number) => v / SCALE;
  const width = Math.max(480, ...indexes.map((i) => px(layout.layers[i]?.width ?? 0))) + PAD * 2;

  const parts: string[] = [];
  let y = PAD;
  for (const i of indexes) {
    const layer = tower.layers[i];
    const ll = layout.layers[i];
    if (!layer || !ll) continue;
    const w = px(ll.width);
    const h = px(ll.depth);
    const ox = PAD + (width - PAD * 2 - w) / 2;
    const oy = y + TITLE_H;
    const X = (x: number) => ox + px(x + ll.width / 2);
    const Y = (z: number) => oy + px(z + ll.depth / 2);
    const label = `L${String(layer.index + 1).padStart(2, '0')}`;

    parts.push(`<g class="layer" id="layer-${esc(layer.id)}">`);
    parts.push(`<text x="${PAD}" y="${y + 22}" font-family="${MONO}" font-size="14" fill="${p.accent}">${label}</text>`);
    parts.push(`<text x="${PAD + 44}" y="${y + 22}" font-family="${UI}" font-size="20" font-weight="700" fill="${p.text}">${esc(layer.title)}</text>`);
    if (layer.description) parts.push(`<text x="${PAD + 44}" y="${y + 42}" font-family="${UI}" font-size="13" fill="${p.dim}">${esc(fit(layer.description, width - PAD * 2 - 44, 6.2))}</text>`);
    parts.push(`<rect x="${PAD}" y="${oy - 12}" width="${width - PAD * 2}" height="${h + 24}" rx="6" fill="none" stroke="${p.accent}" stroke-opacity="0.35"/>`);

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
    y = oy + h + 12 + GAP;
  }
  const height = y - GAP + PAD;

  const markers = (Object.keys(EDGE_STYLE) as EdgeKind[]).map((k) =>
    `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${edgeColor(k, p)}"/></marker>`).join('');
  const title = `${tower.name}${indexes.length === 1 ? ` — ${tower.layers[indexes[0]]?.title ?? ''}` : ''}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}">`,
    `<title>${esc(title)}</title>`,
    `<defs>${markers}</defs>`,
    `<rect width="100%" height="100%" fill="${p.bg}"/>`,
    ...parts,
    `<text x="${(width - PAD).toFixed(0)}" y="${(height - 10).toFixed(0)}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${p.dim}">${esc(tower.name)} · Flow Tower</text>`,
    '</svg>',
  ].join('\n');
}
