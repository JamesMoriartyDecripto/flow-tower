import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from '../config';

/**
 * File-based long-term memory: memory/patterns.md holds DO/DON'T rules that the
 * team learned the hard way. Plain Markdown on purpose: humans review it in PRs,
 * and agents read it like any other doc. No vector DB until grep stops being enough.
 *
 * Format, one rule per line:
 *   - DO|DONT [area,area] rule text (#issue)
 */
export interface Pattern { kind: 'DO' | 'DONT'; areas: string[]; text: string; issue?: number }

const LINE = /^- (DO|DONT) \[([^\]]*)\] (.+?)(?: \(#(\d+)\))?$/;

export function loadPatterns(): Pattern[] {
  return readFileSync(PATHS.patterns, 'utf8')
    .split('\n')
    .map((l) => LINE.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      kind: m[1] as Pattern['kind'],
      areas: m[2].split(',').map((a) => a.trim()).filter(Boolean),
      text: m[3],
      issue: m[4] ? Number(m[4]) : undefined,
    }));
}

/** Returns rules for the given areas plus global ones ("*"), formatted for a prompt. */
export function recallPatterns(areas: string[], limit = 25): string {
  const wanted = new Set(areas.map((a) => a.toLowerCase()));
  return loadPatterns()
    .filter((p) => p.areas.includes('*') || p.areas.some((a) => wanted.has(a.toLowerCase())))
    .slice(0, limit)
    .map((p) => `- ${p.kind === 'DO' ? 'DO' : "DON'T"}: ${p.text}`)
    .join('\n');
}

/**
 * Promotes a lesson to a permanent rule. Called by the pipeline when the same
 * blocking finding shows up in 2+ issues, never directly by an agent: memory
 * writes are reviewed because a bad rule poisons every future run.
 */
export function rememberPattern(p: Pattern): boolean {
  const existing = loadPatterns();
  const norm = (s: string) => s.toLowerCase().replace(/\W+/g, ' ').trim();
  if (existing.some((e) => norm(e.text) === norm(p.text))) return false;

  const line = `- ${p.kind} [${p.areas.join(',')}] ${p.text}${p.issue ? ` (#${p.issue})` : ''}`;
  const file = readFileSync(PATHS.patterns, 'utf8');
  const marker = '<!-- squad:append -->';
  writeFileSync(PATHS.patterns, file.includes(marker) ? file.replace(marker, `${line}\n${marker}`) : `${file.trimEnd()}\n${line}\n`);
  return true;
}
