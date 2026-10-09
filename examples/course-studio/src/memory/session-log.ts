import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import { appendFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PATHS, ROOT, type Run } from '../config';
import type { Intake } from '../intake';

/** Append-only run journal. Humans read it; the next run's director gets the patterns. */
export async function appendSessionLog(run: Run, intake: Intake, outcome: { status: string; costUsd: number; notes: string }) {
  const entry = [
    `\n## ${new Date().toISOString().slice(0, 10)} - ${intake.title} (${run.slug})`,
    `- Outcome: **${outcome.status}**, cost $${outcome.costUsd.toFixed(2)}, modules ${intake.modules}, flags ${intake.risk_flags.join(', ') || 'none'}`,
    `- Notes: ${outcome.notes.replace(/\n/g, ' ').slice(0, 400)}`,
  ].join('\n');
  await appendFile(PATHS.sessionLog, entry + '\n');
}

/** DO/DON'T rules relevant to this brief's risk flags, capped so context stays cheap. */
export function recallPatterns(flags: string[], max = 4000): string {
  const md = readFileSync(PATHS.patterns, 'utf8');
  const sections = md.split(/\n(?=## )/);
  const always = sections.filter((s) => /^## (Always|Pedagogy|Review)/.test(s));
  const tagged = sections.filter((s) => flags.some((f) => s.toLowerCase().includes(`[${f}]`)));
  return [...new Set([...always, ...tagged])].join('\n').slice(0, max);
}

/** Async audit line per tool call (never blocks). */
export function appendHookLog(run: Run, input: PreToolUseHookInput) {
  const line = `${new Date().toISOString()} ${run.slug} ${input.agent_type ?? 'director'} ${input.tool_name}\n`;
  queueMicrotask(() => void appendFile(join(ROOT, 'logs/hooks.log'), line).catch(() => undefined));
}

/** The Stop hook blocks the director while a required artifact for a passed stage is missing. */
export async function gatesPending(run: Run): Promise<string[]> {
  const files = new Set(await readdir(run.dir, { recursive: true }));
  const pending: string[] = [];
  if (files.has('design/outline.md') && !files.has('design/blueprint.yaml')) pending.push('evidence plan (blueprint)');
  if ([...files].some((f) => f.startsWith('lessons/')) && !files.has('sources/registry.json')) pending.push('source registry');
  if (files.has('package/sandbox-url.txt') && !files.has('marketing/landing.md')) pending.push('launch kit');
  return pending;
}
