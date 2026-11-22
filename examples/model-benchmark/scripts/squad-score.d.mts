export interface CaseKey {
  id: string;
  file: string;
  pattern: string;
  note?: string;
}

export interface SquadCase {
  id: string;
  kind: 'defect' | 'clean';
  keys: CaseKey[];
  [field: string]: unknown;
}

export interface Finding {
  file?: string;
  severity?: string;
  what?: string;
  why?: string;
  fix?: string;
  quote?: string;
  [field: string]: unknown;
}

export interface ScoreResult {
  pass: boolean;
  verdict: 'approve' | 'changes' | null;
  flagged: boolean;
  keys: string[];
  blocking: number;
  findings: number;
  verified: number;
  failure: string | null;
}

export function scoreRun(args: {
  kase: SquadCase;
  outcome: string;
  answer: string;
  readFile: (path: string) => string | null | undefined;
  parseVerdict: (answer: string) => { verdict: string; findings: Finding[] };
  checkFinding: (finding: Finding, readFile: (path: string) => string | null | undefined) => { status: string };
}): ScoreResult;

export interface RunLine {
  role: string;
  model: string;
  kind: 'defect' | 'clean' | string;
  pass: boolean;
  flagged: boolean;
  failure: string | null;
  findings: number;
  verified: number;
  seconds: number | null;
  cost: number | null;
}

export interface SummaryRow {
  role: string;
  model: string;
  runs: number;
  pass: number;
  defectRuns: number;
  caught: number;
  flaggedDefects: number;
  cleanRuns: number;
  cleanPass: number;
  failures: Record<string, number>;
  findings: number;
  verified: number;
  medianSeconds: number | null;
  cost: number;
  costPerPass: number | null;
}

export function summarize(lines: RunLine[]): SummaryRow[];

export function table(rows: SummaryRow[]): string;
