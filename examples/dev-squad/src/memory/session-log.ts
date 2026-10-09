import { appendFileSync, readFileSync } from 'node:fs';
import { PATHS } from '../config';

/**
 * Short-term, append-only run journal (memory/session-log.md). One entry per
 * session end (Stop hook) and one per finished issue (pipeline). The
 * SessionStart hook injects the last few entries into every new agent.
 */
export interface SessionEntry {
  issue: number;
  outcome: 'merged' | 'pr_open' | 'escalated' | 'needs_info' | 'blocked' | 'stopped';
  rounds: number;
  costUsd: number;
  lesson: string;
  at: string;
}

const HEADER = /^## (\d{4}-\d{2}-\d{2}T[\d:.]+Z) — #(\d+) (\w+)$/;

export function appendRun(entry: Omit<SessionEntry, 'at'>): void {
  const at = new Date().toISOString();
  appendFileSync(
    PATHS.sessionLog,
    `\n## ${at} — #${entry.issue} ${entry.outcome}\n` +
      `- rounds: ${entry.rounds} · cost: $${entry.costUsd.toFixed(2)}\n` +
      `- lesson: ${entry.lesson.replace(/\n/g, ' ')}\n`,
  );
}

/** Lightweight variant used by the Stop hook of each individual session. */
export async function appendSessionEntry(e: { issue: number; sessionId: string; files: number; summary: string }) {
  appendRun({ issue: e.issue, outcome: 'stopped', rounds: 0, costUsd: 0, lesson: `session ${e.sessionId.slice(0, 8)}, ${e.files} files: ${e.summary}` });
}

export function recentEntries(n: number): SessionEntry[] {
  const blocks = readFileSync(PATHS.sessionLog, 'utf8').split(/\n(?=## )/);
  return blocks
    .map((block) => {
      const [head, ...rest] = block.trim().split('\n');
      const m = HEADER.exec(head ?? '');
      if (!m) return undefined;
      const body = rest.join('\n');
      return {
        at: m[1],
        issue: Number(m[2]),
        outcome: m[3] as SessionEntry['outcome'],
        rounds: Number(/rounds: (\d+)/.exec(body)?.[1] ?? 0),
        costUsd: Number(/cost: \$([\d.]+)/.exec(body)?.[1] ?? 0),
        lesson: /lesson: (.*)/.exec(body)?.[1] ?? '',
      };
    })
    .filter((e): e is SessionEntry => e !== undefined && e.outcome !== 'stopped')
    .slice(-n);
}
