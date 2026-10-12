import type { TowerDoc } from '../../core/doc';
import type { Workspace } from '../../core/types';
import type { Palette } from '../exportSvg';
import { towerSvg } from '../exportSvg';
import type { TowerLayout } from '../layout';

/**
 * A light palette for paper: the app's dark theme would print as a dark block on every page. Same
 * roles as the app's palette, so the drawing reads the same.
 */
export const PAPER: Palette = {
  bg: '#ffffff', plate: '#f4f6fa', accent: '#c2410c', accent2: '#b45309', text: '#111827', dim: '#4b5563',
};

export interface DocImages {
  cover?: string;
  /** Keyed by layer id (the layer's document anchor is derived from it). */
  layers: Record<string, string>;
}

/** The SVG drawings of the document: the whole-tower map for the cover, one drawing per layer. */
export function docImages(ws: Workspace, doc: TowerDoc, layouts: Record<string, TowerLayout>): DocImages {
  const out: DocImages = { layers: {} };
  const root = ws.towers[doc.towerId];
  const rootLayout = layouts[doc.towerId];
  if (root && rootLayout) out.cover = towerSvg(root, rootLayout, { arrange: 'map', palette: PAPER });
  for (const c of doc.chapters) {
    const tower = ws.towers[c.towerId];
    const layout = layouts[c.towerId];
    if (!tower || !layout) continue;
    for (const l of c.layers) out.layers[l.id] = towerSvg(tower, layout, { layers: [l.index], palette: PAPER });
  }
  return out;
}
