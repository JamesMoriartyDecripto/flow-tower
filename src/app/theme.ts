import { Color } from 'three';
import type { EdgeKind, NodeType } from '../core/schema';
import orbitron from '@fontsource/orbitron/files/orbitron-latin-600-normal.woff?url';
import rajdhani from '@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff?url';
import mono from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';

export const FONTS = { display: orbitron, ui: rajdhani, mono };

export const COLORS = {
  bg: '#030a18',
  plate: '#0a1f3f',
  orange: '#ff8a1f',
  amber: '#ffb347',
  white: '#e8f1ff',
  dim: '#7f93b5',
};

/** Colors pushed above 1.0 so the bloom pass picks them up. */
export const GLOW = {
  orange: new Color(COLORS.orange).multiplyScalar(2.2),
  amber: new Color(COLORS.amber).multiplyScalar(1.6),
  white: new Color(COLORS.white).multiplyScalar(1.6),
};

/** World units per ELK pixel, and node footprint in ELK pixels. */
export const SCALE = 1 / 40;
export const NODE_W = 190;
export const NODE_H = 64;
export const PLATE_PAD = 2.2;
export const LAYER_GAP = 7;

export type Glyph = 'ring' | 'disc' | 'hex' | 'box' | 'diamond' | 'octa' | 'ico' | 'cylinder' | 'sphere' | 'shield' | 'torus';

export const NODE_STYLE: Record<NodeType, { glyph: Glyph; tag: string; hint: string }> = {
  entry:    { glyph: 'ring',     tag: 'IN',   hint: 'Entry point / trigger' },
  output:   { glyph: 'disc',     tag: 'OUT',  hint: 'Output / result' },
  agent:    { glyph: 'hex',      tag: 'AGT',  hint: 'LLM agent' },
  process:  { glyph: 'box',      tag: 'FN',   hint: 'Deterministic step' },
  decision: { glyph: 'diamond',  tag: 'IF',   hint: 'Branch / router' },
  tool:     { glyph: 'octa',     tag: 'TOOL', hint: 'Tool / MCP server' },
  model:    { glyph: 'ico',      tag: 'LLM',  hint: 'Model' },
  memory:   { glyph: 'cylinder', tag: 'MEM',  hint: 'Memory / state / storage' },
  human:    { glyph: 'sphere',   tag: 'HITL', hint: 'Human in the loop' },
  guard:    { glyph: 'shield',   tag: 'GRD',  hint: 'Guardrail / policy' },
  hook:     { glyph: 'torus',    tag: 'HOOK', hint: 'Lifecycle hook' },
};

export const EDGE_STYLE: Record<EdgeKind, { color: Color; width: number; dashed: boolean; hint: string }> = {
  flow:    { color: GLOW.orange, width: 1.8, dashed: false, hint: 'Sequential flow' },
  call:    { color: GLOW.white,  width: 1.2, dashed: false, hint: 'Synchronous call' },
  spawn:   { color: GLOW.amber,  width: 1.6, dashed: true,  hint: 'Spawns a sub-agent' },
  handoff: { color: GLOW.orange, width: 3.0, dashed: false, hint: 'Transfers control' },
  return:  { color: GLOW.white,  width: 1.2, dashed: true,  hint: 'Returns a result' },
  data:    { color: GLOW.white,  width: 0.9, dashed: true,  hint: 'Reads / writes data' },
};
