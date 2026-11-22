export interface SquadRun {
  stdout: string;
  rec: Record<string, any> | null;
  outcome: string;
  seconds: number;
}

export function runSquad(opts: { runMjs: string; args: string[]; timeoutS: number; tmp: string }): Promise<SquadRun>;
export function doneSet(outFile: string, keyOf: (line: any) => string): Set<string>;
export function pool<T>(items: T[], parallel: number, fn: (item: T) => Promise<unknown>): Promise<void>;
