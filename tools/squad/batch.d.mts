/** Types for tools/squad/batch.mjs: the module stays plain JS, and this is what its TypeScript test sees. */

export const API_BASE: string;
export const BATCH_NOTE: string;

export function chatUrl(): string;

export type BatchOneResult =
  | { ok: true; content: string; usage: Record<string, unknown> }
  | { ok: false; error: string };

export function batchOne(opts: {
  key: string;
  body: { model: string; [key: string]: unknown };
  pollMs?: number;
  waitMinutes?: number;
  /** A stub can be narrower than `fetch`: only url, method and a JSON body are used. */
  fetchImpl?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  sleep?: (ms: number) => Promise<unknown>;
  log?: (line: string) => void;
}): Promise<BatchOneResult>;
