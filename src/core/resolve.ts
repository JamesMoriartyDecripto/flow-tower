import { parse as parseYaml } from 'yaml';
import { OPS_KEYS, type AgentDef, type OpsDef, type PromptDef, type PromptRef } from './schema.ts';
import type { Issue, ResolvedAgent, ResolvedPrompt } from './types.ts';

/** Minimal file access so resolution stays testable without touching disk. */
export interface FileReader {
  read(path: string): Promise<string | undefined>;
}

const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Rough token estimate (~4 chars per token), good enough to compare prompt sizes. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function detectVars(text: string): string[] {
  return [...new Set([...text.matchAll(VAR)].map((m) => m[1]))];
}

/** Splits a Claude Code style agent file into frontmatter fields and body. */
export function parseAgentMarkdown(md: string): { fields: Record<string, unknown>; body: string } {
  const m = FRONTMATTER.exec(md);
  if (!m) return { fields: {}, body: md.trim() };
  try {
    return { fields: (parseYaml(m[1]) ?? {}) as Record<string, unknown>, body: m[2].trim() };
  } catch {
    return { fields: {}, body: md.trim() };
  }
}

const toList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

export async function resolvePromptDef(
  def: PromptDef, fs: FileReader, issues: Issue[], where: string, id?: string,
): Promise<ResolvedPrompt> {
  let text = def.text ?? '';
  if (def.file) {
    const content = await fs.read(def.file);
    if (content === undefined) issues.push({ level: 'error', message: `prompt file not found: ${def.file}`, path: where });
    text = content ?? '';
  }
  return {
    id, text, source: def.file, description: def.description,
    vars: def.vars ?? detectVars(text), tokens: estimateTokens(text),
  };
}

export async function resolvePromptRef(
  ref: PromptRef | undefined, registry: Record<string, ResolvedPrompt>, fs: FileReader, issues: Issue[], where: string,
): Promise<ResolvedPrompt | undefined> {
  if (ref === undefined) return undefined;
  if (typeof ref !== 'string') return resolvePromptDef(ref, fs, issues, where);
  const found = registry[ref];
  if (!found) issues.push({ level: 'error', message: `unknown prompt "${ref}"`, path: where });
  return found;
}

/** Operational fields present on a definition (agent or node), without undefined keys. */
export function pickOps(def: OpsDef): OpsDef {
  return Object.fromEntries(OPS_KEYS.filter((k) => def[k] !== undefined).map((k) => [k, def[k]])) as OpsDef;
}

export async function resolveAgent(
  id: string, def: AgentDef, prompts: Record<string, ResolvedPrompt>, fs: FileReader, issues: Issue[],
): Promise<ResolvedAgent> {
  const where = `agents.${id}`;
  let imported: Record<string, unknown> = {};
  let importedPrompt: ResolvedPrompt | undefined;

  if (def.from) {
    const md = await fs.read(def.from);
    if (md === undefined) {
      issues.push({ level: 'error', message: `agent file not found: ${def.from}`, path: where });
    } else {
      const { fields, body } = parseAgentMarkdown(md);
      imported = fields;
      importedPrompt = { text: body, source: def.from, vars: detectVars(body), tokens: estimateTokens(body) };
    }
  }

  const { name, description, model, tools, ...rest } = imported;
  return {
    id,
    name: def.name ?? (name as string | undefined) ?? id,
    description: def.description ?? (description as string | undefined),
    model: def.model ?? (model as string | undefined),
    prompt: (await resolvePromptRef(def.prompt, prompts, fs, issues, where)) ?? importedPrompt,
    tools: def.tools ?? toList(tools),
    harness: def.harness ?? {},
    files: [...(def.from ? [def.from] : []), ...(def.files ?? [])],
    source: def.from,
    tower: def.tower,
    runtime: def.runtime,
    resources: def.resources ?? [],
    match: def.match,
    ops: pickOps(def),
    meta: { ...rest, ...def.meta },
  };
}
