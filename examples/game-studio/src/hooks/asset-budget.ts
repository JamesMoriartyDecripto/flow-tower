import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { loadConfig } from '../config';

/**
 * PreToolUse guard for asset production. Budgets live in config/asset-budgets.yaml:
 *
 *   classes:
 *     hero_character: { tris: [45000, 22000, 9000], texture_max: 4096, materials: 3, bones: 120 }
 *     prop_small:     { tris: [2500, 1200, 400],    texture_max: 1024, materials: 1, bones: 0 }
 *
 * Two entry points:
 *  - mcp__forge__register_asset: the declared stats are checked against the class budget;
 *  - mcp__blender__execute_blender_code: obvious budget breakers in the script are denied
 *    before Blender runs them (8k textures, subdivision levels > 2, unapplied huge arrays).
 */
interface ClassBudget { tris: number[]; texture_max: number; materials: number; bones: number }
interface Budgets { classes: Record<string, ClassBudget> }

const budgets = () => loadConfig<Budgets>('asset-budgets').classes;

const deny = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse' as const,
    permissionDecision: 'deny' as const,
    permissionDecisionReason: reason,
  },
});

const SCRIPT_RULES: [RegExp, string][] = [
  [/\b(8192|16384)\b/, 'Texture or bake resolution above 4096 is never allowed for the vertical slice.'],
  [/levels\s*=\s*([3-9])/, 'Subdivision level > 2: bake detail into normals instead of shipping geometry.'],
  [/render_levels\s*=\s*([3-9])/, 'Subdivision render level > 2 will explode the bake time.'],
  [/count\s*=\s*(\d{4,})/, 'Array/particle count >= 1000: use instancing in Unreal (HISM) instead.'],
];

export const assetBudget: HookCallback = async (input) => {
  const { tool_name, tool_input } = input as PreToolUseHookInput;

  if (tool_name === 'mcp__blender__execute_blender_code') {
    const code = String((tool_input as { code?: string }).code ?? '');
    for (const [re, reason] of SCRIPT_RULES) if (re.test(code)) return deny(`asset-budget: ${reason}`);
    return {};
  }

  // mcp__forge__register_asset
  const a = tool_input as { asset_class?: string; tris?: number[]; texture_max?: number; materials?: number; bones?: number; path?: string };
  const budget = a.asset_class ? budgets()[a.asset_class] : undefined;
  if (!budget) return deny(`asset-budget: unknown asset_class "${a.asset_class}". Use one of: ${Object.keys(budgets()).join(', ')}.`);

  const over: string[] = [];
  (a.tris ?? []).forEach((t, lod) => {
    if (budget.tris[lod] !== undefined && t > budget.tris[lod]) over.push(`LOD${lod} ${t} tris > ${budget.tris[lod]}`);
  });
  if ((a.texture_max ?? 0) > budget.texture_max) over.push(`texture ${a.texture_max}px > ${budget.texture_max}px`);
  if ((a.materials ?? 0) > budget.materials) over.push(`${a.materials} materials > ${budget.materials}`);
  if ((a.bones ?? 0) > budget.bones) over.push(`${a.bones} bones > ${budget.bones}`);
  if ((a.tris?.length ?? 0) < budget.tris.length) over.push(`missing LODs: need ${budget.tris.length}, got ${a.tris?.length ?? 0}`);

  if (!over.length) return {};
  return deny(`asset-budget: ${a.path ?? 'asset'} (${a.asset_class}) over budget: ${over.join('; ')}. ` +
    'Run pipelines/blender/retopo.py or generate_lods.py and re-register.');
};
