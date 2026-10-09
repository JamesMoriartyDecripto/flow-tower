import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from './config';

const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Renders prompts/<name>.md. Missing variables throw instead of silently shipping
 * a prompt with "{{brief}}" in it, a classic prompt-chaining bug.
 */
export function renderPrompt(name: string, vars: Record<string, string | number>): string {
  const template = readFileSync(join(PATHS.prompts, `${name}.md`), 'utf8');
  return fill(template, vars, name);
}

/** Same rendering for agent-file bodies that carry {{variables}} (module-writer, localizer). */
export function fill(template: string, vars: Record<string, string | number>, name = 'agent'): string {
  return template.replace(VAR, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt "${name}" is missing variable {{${key}}}`);
    return String(vars[key]);
  });
}

/**
 * Briefs, sources, lessons and reviewer quotes are untrusted. Wrap them so they cannot
 * close the tag they are placed in, and cap their length.
 */
export const untrusted = (text: string, tag: string, max = 12_000) =>
  text.replaceAll(`</${tag}>`, `<\\/${tag}>`).slice(0, max);
