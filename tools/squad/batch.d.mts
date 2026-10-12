/** Types for tools/squad/batch.mjs: the module stays plain JS, and this is what its TypeScript test sees. */

export const API_BASE: string;
export const BATCH_NOTE: string;

export function chatUrl(): string;

export type BatchOneResult =
  | { ok: true; content: string; usage: Record<string, unknown>; generationId?: string }
  | { ok: false; error: string; noBatch?: true };

/** A stub can be narrower than `fetch`: only url, method, headers, body and signal are used. */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: unknown }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export function batchOne(opts: {
  key: string;
  body: { model: string; [key: string]: unknown };
  pollMs?: number;
  waitMinutes?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (line: string) => void;
  onCreated?: (id: string) => void;
}): Promise<BatchOneResult>;

export function generationCost(opts: {
  key: string;
  id: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (line: string) => void;
}): Promise<number | null>;
