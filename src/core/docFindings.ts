import type { Issue, IssueLevel } from './types.ts';

/*
 * Validation issues as numbered findings (V-01, V-02...). The workspace's issues are read once here, so
 * the count table, the finding list and the summary tile all rest on the same sort and the same ids.
 */

/** Most severe first: the order the findings print in. */
const RANK: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };

export const LEVEL_LABEL: Record<IssueLevel, string> = { error: 'Error', warning: 'Warning', info: 'Info' };

export interface Finding {
  /** `V-01`, numbered after the sort, so the id follows the order the table prints. */
  id: string;
  level: IssueLevel;
  /** Where the issue is: the path the validator gave, or the tower when it gave none. */
  location: string;
  message: string;
}

export interface SeverityCount { level: IssueLevel; label: string; count: number }

/** Errors, warnings and info, in that order, each with its count (zero counts are kept: the table shows them). */
export function severityCounts(issues: Issue[]): SeverityCount[] {
  return (['error', 'warning', 'info'] as IssueLevel[]).map((level) => ({
    level,
    label: LEVEL_LABEL[level],
    count: issues.filter((i) => i.level === level).length,
  }));
}

/**
 * Sorted by severity, then by location, then by message, so the same issues always number the same way.
 * `towerName` names an issue that has no path of its own.
 */
export function findingsOf(issues: Issue[], towerName: string): Finding[] {
  const rows = issues.map((i) => ({
    level: i.level,
    location: i.path ?? towerName,
    message: i.message,
  }));
  rows.sort((a, b) => RANK[a.level] - RANK[b.level]
    || (a.location < b.location ? -1 : a.location > b.location ? 1 : 0)
    || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  return rows.map((r, i) => ({ id: `V-${String(i + 1).padStart(2, '0')}`, ...r }));
}
