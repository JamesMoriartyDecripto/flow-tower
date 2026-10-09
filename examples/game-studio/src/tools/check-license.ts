import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { registry } from '../memory/asset-registry';

/**
 * License and IP clearance for anything the studio did not make itself: reference
 * photos, CC0 textures, Freesound clips, fonts, music stems. The license-check hook
 * blocks the obvious cases; this tool is what agents call to ASK before they use something.
 */
const LICENSES: Record<string, { commercial: boolean; attribution: boolean; notes?: string }> = {
  'CC0': { commercial: true, attribution: false },
  'CC-BY-4.0': { commercial: true, attribution: true },
  'CC-BY-NC-4.0': { commercial: false, attribution: true, notes: 'non-commercial: reference only, never ship' },
  'CC-BY-SA-4.0': { commercial: true, attribution: true, notes: 'share-alike: legal review before shipping' },
  'Fab-Standard': { commercial: true, attribution: false },
  'Unreal-Marketplace': { commercial: true, attribution: false, notes: 'Unreal Engine projects only' },
  'SIL-OFL-1.1': { commercial: true, attribution: false, notes: 'fonts: do not sell the font file itself' },
  'Forge-Original': { commercial: true, attribution: false },
};

const TRADEMARKS = /\b(nintendo|zelda|pokemon|blizzard|warcraft|ghibli|fromsoftware|souls|disney|marvel|hollow knight|minecraft)\b/i;

export const checkLicense = tool(
  'check_license',
  'Check whether a third-party asset or reference may be used and how. Also flags trademark / style-imitation risk ' +
    'in names and descriptions. Call it BEFORE downloading, generating from, or registering an asset.',
  {
    name: z.string().describe('Asset or reference name'),
    license: z.string().describe('SPDX-like id, e.g. CC0, CC-BY-4.0, Fab-Standard'),
    source_url: z.string().url().optional(),
    usage: z.enum(['reference_only', 'ship_in_game', 'marketing']),
    description: z.string().max(500).optional(),
  },
  async ({ name, license, source_url, usage, description }) => {
    const lic = LICENSES[license];
    const issues: string[] = [];

    if (!lic) issues.push(`Unknown license "${license}": treat as all-rights-reserved until legal clears it.`);
    else if (usage !== 'reference_only' && !lic.commercial) issues.push(`${license} forbids commercial use (${lic.notes}).`);
    if (lic?.attribution && !source_url) issues.push('Attribution required: provide source_url for the credits screen.');
    if (lic?.notes && lic.commercial) issues.push(`Note: ${lic.notes}.`);

    const tm = TRADEMARKS.exec(`${name} ${description ?? ''}`);
    if (tm) issues.push(`Trademark / IP risk: "${tm[0]}". Do not imitate protected characters, logos or signature styles.`);

    const dupes = registry.list({ source_url }).filter((a) => source_url && a.license !== license);
    if (dupes.length) issues.push(`Registry already lists this source under license ${dupes[0].license}. Resolve the conflict first.`);

    const verdict = issues.some((i) => !i.startsWith('Note:')) ? 'BLOCKED' : 'CLEARED';
    const credit = lic?.attribution ? `\nCredit line: "${name}" (${license}) ${source_url}` : '';
    return {
      content: [{ type: 'text', text: `${verdict}: ${name} for ${usage}\n${issues.map((i) => `- ${i}`).join('\n') || '- no issues'}${credit}` }],
      isError: verdict === 'BLOCKED',
    };
  },
  { annotations: { readOnlyHint: true } },
);
