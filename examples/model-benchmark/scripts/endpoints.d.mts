/** Types for scripts/endpoints.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

export interface EndpointCtx {
  key: string;
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;
  timeoutMs?: number;
}

export interface EndpointTask {
  endpoint: string;
  request?: Record<string, unknown>;
  images: string[];
  dir: string;
}

export interface EndpointResult {
  answer: string | null;
  cost: number;
  provider: string | null;
  firstOutputMs: number | null;
  totalMs: number;
  error: string | null;
  raw?: unknown;
}

export const ENDPOINT_CALLS: Record<string, (ctx: EndpointCtx, model: string, task: EndpointTask) => Promise<EndpointResult>>;

export function userContent(task: EndpointTask, prompt: string): unknown;
