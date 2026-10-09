import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

/**
 * PreToolUse license / IP guard. Shipping a vertical slice with a ripped texture
 * or a trademarked creature design is a legal problem, not a quality problem, so
 * it is enforced in code, before the tool runs.
 *
 *  - WebFetch: block downloads of binary assets from hosts that are not on the allowlist.
 *  - mcp__imagegen__generate_image: block prompts that name living artists, studios or franchises.
 *  - mcp__forge__register_asset: require a license from the commercial allowlist.
 */
const COMMERCIAL_OK = new Set(['CC0', 'CC-BY-4.0', 'Forge-Original', 'Purchased-Standard', 'Unreal-Marketplace', 'Fab-Standard']);
const ASSET_HOSTS = /^(?:[\w-]+\.)?(polyhaven\.com|ambientcg\.com|fab\.com|freesound\.org|forge\.internal)$/;
const BINARY = /\.(fbx|glb|gltf|obj|blend|uasset|png|jpe?g|exr|tga|wav|ogg|mp3|ttf|otf)(\?|$)/i;

/** Style imitation of named, living creators and franchise IP is out of bounds. */
const IP_TERMS = /\b(in the style of|by artist|ghibli|blizzard|nintendo|zelda|pokemon|hollow knight|fromsoftware|dark souls|disney|pixar|marvel|warhammer)\b/i;

const deny = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse' as const,
    permissionDecision: 'deny' as const,
    permissionDecisionReason: `license-check: ${reason}`,
  },
});

export const licenseCheck: HookCallback = async (input) => {
  const { tool_name, tool_input } = input as PreToolUseHookInput;

  if (tool_name === 'WebFetch') {
    const url = new URL(String((tool_input as { url?: string }).url ?? 'about:blank'));
    if (BINARY.test(url.pathname) && !ASSET_HOSTS.test(url.hostname)) {
      return deny(`${url.hostname} is not an approved asset source. Use Poly Haven, ambientCG, Fab or Freesound, ` +
        'or ask the concept artist to produce an original.');
    }
    return {};
  }

  if (tool_name === 'mcp__imagegen__generate_image') {
    const prompt = String((tool_input as { prompt?: string }).prompt ?? '');
    const hit = IP_TERMS.exec(prompt);
    if (hit) return deny(`prompt references protected style or IP ("${hit[0]}"). Describe shapes, palette and mood using config/style-guide.json tokens instead.`);
    return {};
  }

  if (tool_name === 'mcp__forge__register_asset') {
    const { license, source_url } = tool_input as { license?: string; source_url?: string };
    if (!license || !COMMERCIAL_OK.has(license)) {
      return deny(`license "${license ?? 'none'}" is not cleared for commercial use. Allowed: ${[...COMMERCIAL_OK].join(', ')}.`);
    }
    if (license.startsWith('CC-BY') && !source_url) {
      return deny('CC-BY assets need source_url so the credits screen can attribute them.');
    }
  }
  return {};
};
