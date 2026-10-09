import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from './config';

const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Renders prompts/<name>.md. Missing variables throw instead of silently shipping
 * a prompt with "{{issue_body}}" in it, a classic prompt-chaining bug.
 */
export function renderPrompt(name: string, vars: Record<string, string | number>): string {
  const template = readFileSync(join(PATHS.prompts, `${name}.md`), 'utf8');
  return template.replace(VAR, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt "${name}" is missing variable {{${key}}}`);
    return String(vars[key]);
  });
}

/** Wraps untrusted text so it can never close the tag it is placed in. */
export const untrusted = (text: string, max = 8_000) =>
  text.replaceAll('</issue_body>', '<\\/issue_body>').slice(0, max);
