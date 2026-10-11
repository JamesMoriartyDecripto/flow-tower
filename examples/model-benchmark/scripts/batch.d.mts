/** Types for scripts/batch.mjs: the example stays plain JS, and this is what its TypeScript test sees. */
import type { LiveEvent } from './live.mjs';

/** The task fields the batch path reads, kept minimal so a plain object is enough. */
export interface BatchTask {
  id: string;
  category: string;
  steps: number;
  tools: string[];
  prompt: string;
}

/** A batch run record: the sync shape, plus `batch: true` and no first-output / total timing. */
export interface BatchRecord {
  [key: string]: unknown;
  batch: true;
  firstOutputMs: null;
  totalMs: null;
  ok: boolean;
  error: string | null;
  answer: string | null;
  cost: number;
  steps: number;
}

export const BATCH_WARNING: string;

/** In this version only a single step without tools maps onto one batch request per run. */
export function batchEligible(task: { steps: number; tools: string[] }): boolean;

export function recordFromResult(input: {
  date: string;
  model: string;
  task: BatchTask;
  run: number;
  effort: string;
  result?: { custom_id?: string; error?: { code?: string }; response?: { status_code?: number; body?: unknown } };
}): BatchRecord;

export function runBatch(opts: {
  key: string;
  models: string[];
  tasks: BatchTask[];
  runs: number;
  effort: string;
  date: string;
  body: (model: string, task: BatchTask, session: string) => unknown;
  write?: (rec: BatchRecord, task: BatchTask, run: number) => void;
  emit?: (event: LiveEvent) => unknown;
  log?: (...args: unknown[]) => void;
  waitMinutes?: number;
  pollMs?: number;
  /** A stub can be narrower than `fetch`: only url, method and a JSON body are used. */
  fetchImpl?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  sleep?: (ms: number) => Promise<unknown>;
}): Promise<number>;
