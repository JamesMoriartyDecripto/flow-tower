import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { deny, toolInput } from './decide';

/** Licences that allow reuse in a PAID course, per reuse mode. Anything else may only be cited. */
const QUOTE_OK = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain', 'licensed', 'fair-use-short-quote']);
const ADAPT_OK = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain', 'licensed']);
const MAX_SHORT_QUOTE_WORDS = 50;

interface Source { id: string; url: string; licence?: string; reuse: 'cite' | 'quote' | 'adapt'; quotes?: string[]; attribution?: string }

/**
 * PreToolUse on writes to sources/registry.json. Rejects entries that would let a writer
 * quote or adapt material whose licence is unknown, non-commercial (NC) or no-derivatives (ND).
 * Facts can always be cited and paraphrased; that is not what copyright protects.
 * This is a safety net, not legal advice: ambiguous cases go to the rights reviewer and a human.
 */
export const sourceLicense: HookCallback = async (input) => {
  const { file_path = '', content = '' } = toolInput(input);
  if (!file_path.endsWith('sources/registry.json') || !content) return {};

  let sources: Source[];
  try {
    sources = JSON.parse(content).sources;
  } catch {
    return deny('sources/registry.json must be valid JSON with a "sources" array.');
  }

  const problems: string[] = [];
  for (const s of sources) {
    const licence = s.licence ?? 'unknown';
    if (!/^https?:\/\//.test(s.url)) problems.push(`${s.id}: url must be http(s)`);
    if (s.reuse === 'adapt' && !ADAPT_OK.has(licence)) problems.push(`${s.id}: cannot adapt under "${licence}"`);
    if (s.reuse === 'quote' && !QUOTE_OK.has(licence)) problems.push(`${s.id}: cannot quote under "${licence}"`);
    if (licence === 'fair-use-short-quote') {
      const long = (s.quotes ?? []).find((q) => q.split(/\s+/).length > MAX_SHORT_QUOTE_WORDS);
      if (long) problems.push(`${s.id}: quote over ${MAX_SHORT_QUOTE_WORDS} words needs a licence`);
    }
    if (licence.startsWith('CC-BY') && s.reuse !== 'cite' && !s.attribution) problems.push(`${s.id}: CC BY needs an attribution line`);
  }

  return problems.length
    ? deny(`Licence check failed. Use reuse "cite" and paraphrase, or find a licensed source:\n- ${problems.join('\n- ')}`)
    : {};
};
