import type { Cadence } from './hubAdminModel';

/** One row of GET /api/hub/admin (src/server/hub-admin.ts senderView): metadata only, never a token. */
export interface AdminSender {
  id: string;
  createdAt: number;
  paused: boolean;
  revoked: boolean;
  login?: string;
  cadence?: Cadence;
}

export interface AuditLine { ts: number; action: string; target: string; detail?: Record<string, unknown> }

/** The whole GET /api/hub/admin answer the tab renders from. */
export interface AdminView {
  senders: AdminSender[];
  viewers: string[];
  cadence: Record<string, Cadence>;
  budgets: { global?: number; projects?: Record<string, number> };
  alerts: Record<string, boolean>;
  retentionDays: number;
  audit: AuditLine[];
}

export type CallResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type Run = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) => Promise<CallResult>;

/**
 * One request to the admin routes. A failure carries the server's own message (`{ error }`) so the panel
 * can show it inline; a network failure gets a plain sentence. Nothing here logs the body, because a
 * sender add answers a token in it.
 */
export async function callAdmin<T = unknown>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<CallResult<T>> {
  try {
    const res = await fetch(`/api/hub/admin${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    // 204 answers have no body; only the add and delete routes answer JSON.
    return { ok: true, data: res.status === 204 ? (undefined as T) : ((await res.json()) as T) };
  } catch {
    return { ok: false, error: 'the hub did not answer' };
  }
}
