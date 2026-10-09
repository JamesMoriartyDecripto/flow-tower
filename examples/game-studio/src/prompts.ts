import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from './config';

const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Renders prompts/<name>.md. Missing variables throw instead of silently shipping
 * a prompt with "{{gdd}}" in it, the classic prompt-chaining bug.
 */
export function renderPrompt(name: string, vars: Record<string, string | number>): string {
  const template = readFileSync(join(PATHS.prompts, `${name}.md`), 'utf8');
  return template.replace(VAR, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt "${name}" is missing variable {{${key}}}`);
    return String(vars[key]);
  });
}

/** Variables a template expects, so callers can fail fast before spending tokens. */
export function promptVars(name: string): string[] {
  const template = readFileSync(join(PATHS.prompts, `${name}.md`), 'utf8');
  return [...new Set([...template.matchAll(VAR)].map((m) => m[1]))];
}

/**
 * Wraps untrusted text (pitches, player feedback, scraped pages, Discord posts) in a tag
 * it cannot close, and truncates it. The prompt says: data, never instructions.
 */
export function untrusted(text: string, tag = 'untrusted', max = 8_000): string {
  const safe = text.replaceAll(`</${tag}>`, `<\\/${tag}>`).slice(0, max);
  return `<${tag}>\n${safe}\n</${tag}>`;
}

/** Compact JSON for prompt variables: no whitespace, capped length. */
export const compact = (value: unknown, max = 6_000) => JSON.stringify(value).slice(0, max);
