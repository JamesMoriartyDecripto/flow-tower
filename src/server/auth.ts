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
export interface AuthOptions {
  legacy?: string;
  home: string;
  /** Hub mode as the caller knows it; defaults to FLOW_TOWER_HUB so the env var still works alone. */
  hub?: boolean;
}

export type Auth = { ok: true; sender?: string } | { ok: false };

/** Hub mode: a shared server must never take an unsigned event, even before any token exists. */
export const hubMode = () => /^(1|true|yes)$/i.test(env.FLOW_TOWER_HUB ?? '');

/**
 * Headers any proxy in front of us adds. Their presence means the request was forwarded, whatever the
 * socket says: tailscale serve (and nginx, Cloudflare…) connect from loopback but are reachable from a
 * tailnet or the internet, so such a request must never be treated as local.
 */
const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'tailscale-user-login'] as const;

/** 127.0.0.0/8, ::1, and the IPv4-mapped form Node reports for a loopback peer on a dual-stack socket. */
function isLoopback(addr: string | undefined): boolean {
  return !!addr && (addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.'));
}

/**
 * Did this request come from off this machine (#83)? Only meaningful in hub mode: the local server keeps
 * behaving exactly as before. A missing socket counts as remote — we cannot prove it is local, and being
 * wrong that way only tightens the guard. Pure: no I/O, so the middleware can decide before any route.
 */
export function isRemote(req: IncomingMessage, { hub }: { hub: boolean }): boolean {
  if (!hub) return false;
  if (PROXY_HEADERS.some((h) => req.headers[h] !== undefined)) return true;
  return !isLoopback(req.socket?.remoteAddress);
}

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

export function authorize(req: IncomingMessage, { legacy, home, hub }: AuthOptions): Auth {
  const store = tokenStore(home);
  const entries = store.list();
  // Nothing to check against and not a hub: keep today's behaviour (a local hook needs no token).
  if (!legacy && !entries.length && !(hub ?? hubMode())) return { ok: true };
  const token = presented(req);
  if (token && legacy && same(token, legacy)) return { ok: true, sender: 'default' };
  const hit = token ? store.verify(token) : undefined;
  // A revoked or paused token is gone from verify(): the sender cannot borrow another identity either.
  return hit ? { ok: true, sender: hit.id } : { ok: false };
}
