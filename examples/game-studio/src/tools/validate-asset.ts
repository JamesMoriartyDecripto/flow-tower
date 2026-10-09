import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT, loadConfig } from '../config';

const run = promisify(execFile);
const BLENDER = env.BLENDER_BIN ?? 'blender';

interface MeshReport {
  objects: number;
  tris_per_lod: number[];
  non_manifold_edges: number;
  ngons: number;
  uv_overlap_pct: number;
  texel_density: number;
  materials: number;
  max_texture: number;
  bones: number;
  scale_applied: boolean;
  origin_at_base: boolean;
}

/**
 * Headless technical validation: runs pipelines/blender/validate_mesh.py in a fresh
 * Blender process (never the artist's live session) and compares the report to the
 * asset class budget and the texel density target from the style guide.
 */
export const validateAsset = tool(
  'validate_asset',
  'Validate a .blend/.glb/.fbx against the asset class budget: tris per LOD, manifold, ngons, UV overlap, ' +
    'texel density, materials, texture size, bones, applied scale. Returns PASS or a list of problems.',
  {
    path: z.string().describe('Asset path relative to the project, e.g. Art/Props/beacon_brazier.blend'),
    asset_class: z.string().describe('Key in config/asset-budgets.yaml, e.g. prop_medium, hero_character'),
  },
  async ({ path, asset_class }) => {
    const budget = loadConfig<{ classes: Record<string, { tris: number[]; texture_max: number; materials: number; bones: number }> }>('asset-budgets').classes[asset_class];
    if (!budget) return { content: [{ type: 'text', text: `Unknown asset_class ${asset_class}.` }], isError: true };
    const style = loadConfig<{ texel_density: { target: number; tolerance: number } }>('style-guide');

    const out = join(ROOT, '.forge', 'validate', `${path.replace(/[\\/]/g, '_')}.json`);
    await run(BLENDER, ['-b', '--factory-startup', '-P', join(ROOT, 'pipelines/blender/validate_mesh.py'), '--', path, out], { timeout: 180_000 });
    const r = JSON.parse(await readFile(out, 'utf8')) as MeshReport;

    const problems: string[] = [];
    r.tris_per_lod.forEach((t, i) => { if (budget.tris[i] !== undefined && t > budget.tris[i]) problems.push(`LOD${i}: ${t} tris > ${budget.tris[i]}`); });
    if (r.tris_per_lod.length < budget.tris.length) problems.push(`only ${r.tris_per_lod.length} LODs, need ${budget.tris.length}`);
    if (r.non_manifold_edges > 0) problems.push(`${r.non_manifold_edges} non-manifold edges`);
    if (r.ngons > 0) problems.push(`${r.ngons} ngons (triangulate or quad them)`);
    if (r.uv_overlap_pct > 1) problems.push(`UV overlap ${r.uv_overlap_pct.toFixed(1)}% (> 1%)`);
    if (Math.abs(r.texel_density - style.texel_density.target) > style.texel_density.tolerance) {
      problems.push(`texel density ${r.texel_density} px/m, target ${style.texel_density.target} ± ${style.texel_density.tolerance}`);
    }
    if (r.materials > budget.materials) problems.push(`${r.materials} materials > ${budget.materials}`);
    if (r.max_texture > budget.texture_max) problems.push(`texture ${r.max_texture}px > ${budget.texture_max}px`);
    if (r.bones > budget.bones) problems.push(`${r.bones} bones > ${budget.bones}`);
    if (!r.scale_applied) problems.push('object scale not applied');
    if (!r.origin_at_base) problems.push('origin is not at the base center (breaks Unreal placement)');

    const text = problems.length ? `FAIL ${path}\n- ${problems.join('\n- ')}` : `PASS ${path} (${r.tris_per_lod.join('/')} tris)`;
    return { content: [{ type: 'text', text }], isError: problems.length > 0 };
  },
  { annotations: { readOnlyHint: true, idempotentHint: true } },
);
