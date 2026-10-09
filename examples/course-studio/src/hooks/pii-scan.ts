import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { deny, toolInput } from './decide';

/** Example domains and fictional companies from the style guide are allowed. */
const ALLOWED_EMAIL = /@(example\.(com|org|net)|northwind-labs\.test|acme-learning\.test)$/i;

const PATTERNS: Array<[string, RegExp]> = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/g],
  ['phone', /(?<!\d)(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g],
  ['iban', /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g],
  ['api key', /\b(sk-ant-[\w-]{20,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16})\b/g],
];

/**
 * PreToolUse on lesson, media, assessment and marketing writes. Course content is published
 * to every learner, so it must never contain personal data or credentials, including in
 * "realistic" examples. Fictional people and example.com addresses only.
 */
export const piiScan: HookCallback = async (input) => {
  const { file_path = '', content = '', new_string = '' } = toolInput(input);
  if (!/\/(lessons|media|assessment|marketing|l10n)\//.test(file_path)) return {};
  const text = content + new_string;

  const hits: string[] = [];
  for (const [kind, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (kind === 'email' && ALLOWED_EMAIL.test(m[0])) continue;
      hits.push(`${kind}: ${mask(m[0])}`);
    }
  }
  if (!hits.length) return {};
  return deny(
    `Possible personal data or secrets in ${file_path}:\n- ${hits.slice(0, 5).join('\n- ')}\n` +
      'Use fictional names from config/style-guide.md and @example.com addresses.',
  );
};

/** Never echo the full value back into the transcript. */
const mask = (s: string) => (s.length <= 6 ? '***' : `${s.slice(0, 3)}***${s.slice(-2)}`);
