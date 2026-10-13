import { parse as parseYaml } from 'yaml';
import { OPS_KEYS, type AgentDef, type FileEntry, type OpsDef, type PromptDef, type PromptRef } from './schema.ts';
import type { Issue, ResolvedAgent, ResolvedPrompt } from './types.ts';

/** Minimal file access so resolution stays testable without touching disk. */
export interface FileReader {
  read(path: string): Promise<string | undefined>;
}

/** One file a node or agent lists, and whether a run writes it (so a missing file is expected). */
export interface FileRef {
  path: string;
  optional: boolean;
}

/** The `files` entries as written: a path, or an object that may mark the file optional. */
export function fileRefs(list: FileEntry[] | undefined): FileRef[] {
  return (list ?? []).map((e) => typeof e === 'string'
    ? { path: e, optional: false }
    : { path: e.path, optional: e.optional ?? false });
}

/**
 * One entry per path, in first-seen order. A path listed twice is optional only when every listing is:
 * one required listing still means the file must exist.
 */
export function mergeFileRefs(list: FileRef[]): FileRef[] {
  const byPath = new Map<string, FileRef>();
  for (const r of list) {
    const prev = byPath.get(r.path);
    byPath.set(r.path, prev ? { path: r.path, optional: prev.optional && r.optional } : r);
  }
  return [...byPath.values()];
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

  const { name, description, model, tools, skills, ...rest } = imported;
  // Frontmatter is free YAML: `name: 2025` is a number. Everything downstream expects strings.
  const text = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  // The agent file itself is always required: a missing one is already an error (see `from` above).
  const refs = mergeFileRefs([...(def.from ? [{ path: def.from, optional: false }] : []), ...fileRefs(def.files)]);
  return {
    id,
    name: def.name ?? text(name) ?? id,
    description: def.description ?? text(description),
    model: def.model ?? text(model),
    prompt: (await resolvePromptRef(def.prompt, prompts, fs, issues, where)) ?? importedPrompt,
    tools: def.tools ?? toList(tools),
    harness: def.harness ?? {},
    skills: def.skills ?? toList(skills),
    disabledTools: def.disabled_tools ?? [],
    files: refs.map((r) => r.path),
    optionalFiles: refs.filter((r) => r.optional).map((r) => r.path),
    source: def.from,
    tower: def.tower,
    runtime: def.runtime,
    resources: def.resources ?? [],
    match: def.match,
    ops: pickOps(def),
    meta: { ...rest, ...def.meta },
  };
}
