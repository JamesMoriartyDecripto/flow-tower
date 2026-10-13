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
  /** The webhook as the server shows it: set or not, its format and host. Never the url. */
  notify: { set: boolean; format?: NotifyFormat; host?: string };
  alertThresholds: { errors?: number };
  audit: AuditLine[];
}

export type NotifyFormat = 'json' | 'slack' | 'telegram' | 'ntfy';

export type CallResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type Run = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => Promise<CallResult>;

/**
 * One request to the admin routes. A failure carries the server's own message (`{ error }`) so the panel
 * can show it inline; a network failure gets a plain sentence. Nothing here logs the body, because a
 * sender add answers a token in it.
 */
export async function callAdmin<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<CallResult<T>> {
  // A mutating request always carries a JSON body: the server answers 415 to a POST with no Content-Type
  // (pause and resume send none), so a body-less change gets `{}`. GET stays bodyless.
  const payload = body === undefined && method !== 'GET' ? {} : body;
  try {
    const res = await fetch(`/api/hub/admin${path}`, {
      method,
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
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
