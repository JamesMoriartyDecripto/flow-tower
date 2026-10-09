import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { registry } from '../memory/asset-registry';

/**
 * Adds or updates an asset in the studio registry, the hand-off point between
 * Blender production and Unreal integration. Both PreToolUse guards run first:
 * asset-budget (declared stats vs class budget) and license-check (license allowlist).
 * Only assets with status "approved" are picked up by pipelines/unreal/import_assets.py.
 */
export const registerAsset = tool(
  'register_asset',
  'Register a finished asset (export path, class, LOD tri counts, textures, license) so Unreal integration can import it. ' +
    'Status starts as "in_review"; only the art director gate sets "approved".',
  {
    id: z.string().regex(/^[a-z0-9_]+$/).describe('snake_case, e.g. beacon_brazier'),
    path: z.string().describe('Exported .glb/.fbx under Export/'),
    asset_class: z.string(),
    tris: z.array(z.number().int().positive()).min(1).describe('Triangles per LOD, LOD0 first'),
    texture_max: z.number().int().positive(),
    materials: z.number().int().min(1),
    bones: z.number().int().min(0).default(0),
    license: z.string().default('Forge-Original'),
    source_url: z.string().url().optional(),
    tags: z.array(z.string()).max(12).default([]),
    status: z.enum(['in_review', 'approved', 'rejected']).default('in_review'),
  },
  async (asset) => {
    const existing = registry.get(asset.id);
    if (asset.status === 'approved' && existing?.status !== 'approved' && !existing?.reviewed_by) {
      return {
        content: [{ type: 'text', text: `Refused: ${asset.id} cannot self-approve. The art director gate sets "approved".` }],
        isError: true,
      };
    }
    const saved = registry.upsert({ ...asset, updated_at: new Date().toISOString(), reviewed_by: existing?.reviewed_by });
    const text = `${existing ? 'Updated' : 'Registered'} ${saved.id} v${saved.version} [${saved.status}] ` +
      `${saved.asset_class} ${saved.tris.join('/')} tris, ${saved.texture_max}px, license ${saved.license}`;
    return { content: [{ type: 'text', text }] };
  },
);
