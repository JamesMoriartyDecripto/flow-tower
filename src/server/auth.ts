import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { env } from 'node:process';
import { tokenStore } from './tokens.ts';

/**
 * Who may write to the event hub (#83). Two kinds of secret are accepted, both compared timing-safe:
 * the legacy FLOW_TOWER_TOKEN (one shared secret, sender "default") and the per-sender tokens from
 * `flow-tower token add` (the sender is the token id). Without either, the server stays as it always
 * was: local only, no auth — a fresh checkout must keep working out of the box.
 */
export interface AuthOptions { legacy?: string; home: string }

export type Auth = { ok: true; sender?: string } | { ok: false };

/** Hub mode: a shared server must never take an unsigned event, even before any token exists. */
export const hubMode = () => /^(1|true|yes)$/i.test(env.FLOW_TOWER_HUB ?? '');

/** The presented secret: our own header, or a bearer token (the OTel Collector and proxies use that). */
function presented(req: IncomingMessage): string | undefined {
  const raw = req.headers['x-flow-tower-token'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header) return header;
  const m = /^Bearer[ \t]+(.+)$/i.exec(req.headers.authorization ?? '');
  return m?.[1]?.trim() || undefined;
}

/** Hashes both sides first: timingSafeEqual needs equal lengths, and the length must not leak either. */
function same(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function authorize(req: IncomingMessage, { legacy, home }: AuthOptions): Auth {
  const store = tokenStore(home);
  const entries = store.list();
  // Nothing to check against and not a hub: keep today's behaviour (a local hook needs no token).
  if (!legacy && !entries.length && !hubMode()) return { ok: true };
  const token = presented(req);
  if (token && legacy && same(token, legacy)) return { ok: true, sender: 'default' };
  const hit = token ? store.verify(token) : undefined;
  // A revoked or paused token is gone from verify(): the sender cannot borrow another identity either.
  return hit ? { ok: true, sender: hit.id } : { ok: false };
}
