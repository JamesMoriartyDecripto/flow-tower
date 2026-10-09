import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config';
import type { Finding } from '../loop/review-gate';

/**
 * File-based long-term memory: memory/patterns.md holds DO/DON'T rules the studio
 * learned the hard way (review findings that kept coming back). Plain Markdown on
 * purpose: producers and leads review it in PRs, agents read it like any doc.
 *
 * Format, one rule per line:
 *   - DO|DONT [area,area] rule text (seen: N)
 * Areas are department ids (art, assets, engine, world, design, engineering, qa, marketing) or "*".
 */
export interface Pattern { kind: 'DO' | 'DONT'; areas: string[]; text: string; seen: number }

const FILE = join(ROOT, 'memory', 'patterns.md');
const LINE = /^- (DO|DONT) \[([^\]]*)\] (.+?)(?: \(seen: (\d+)\))?$/;
const MARKER = '<!-- forge:append -->';
const norm = (s: string) => s.toLowerCase().replace(/\W+/g, ' ').trim();

export function loadPatterns(): Pattern[] {
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .map((l) => LINE.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      kind: m[1] as Pattern['kind'],
      areas: m[2].split(',').map((a) => a.trim()).filter(Boolean),
      text: m[3],
      seen: Number(m[4] ?? 1),
    }));
}

/** Rules for the given areas plus global ones ("*"), most-seen first, formatted for a prompt. */
export function recallPatterns(areas: string[], limit = 25): string {
  const wanted = new Set(areas.map((a) => a.toLowerCase()));
  return loadPatterns()
    .filter((p) => p.areas.includes('*') || p.areas.some((a) => wanted.has(a.toLowerCase())))
    .sort((a, b) => b.seen - a.seen)
    .slice(0, limit)
    .map((p) => `- ${p.kind === 'DO' ? 'DO' : "DON'T"}: ${p.text}`)
    .join('\n');
}

/**
 * Promotes a recurring review finding to a permanent DON'T rule (or bumps its
 * counter). Called by the pipeline after a gate, never by an agent directly:
 * a bad rule poisons every future run, so memory writes stay deterministic.
 * Returns true when a NEW rule was added.
 */
export function promote(finding: Finding & { department?: string }): boolean {
  if (finding.severity === 'minor') return false;
  const area = finding.department ?? finding.area;
  const text = `${finding.issue.replace(/\.$/, '')}; instead: ${finding.fix}`;
  const file = readFileSync(FILE, 'utf8');
  const lines = file.split('\n');

  const idx = lines.findIndex((l) => {
    const m = LINE.exec(l.trim());
    return m !== null && norm(m[3]).startsWith(norm(finding.issue).slice(0, 60));
  });
  if (idx >= 0) {
    const m = LINE.exec(lines[idx].trim())!;
    lines[idx] = `- ${m[1]} [${m[2]}] ${m[3]} (seen: ${Number(m[4] ?? 1) + 1})`;
    writeFileSync(FILE, lines.join('\n'));
    return false;
  }

  const line = `- DONT [${area}] ${text} (seen: 1)`;
  writeFileSync(FILE, file.includes(MARKER) ? file.replace(MARKER, `${line}\n${MARKER}`) : `${file.trimEnd()}\n${line}\n`);
  return true;
}
