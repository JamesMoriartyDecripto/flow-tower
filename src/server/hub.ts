import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorize, hubMode, isLoopback, isRemote } from './auth.ts';
import { userHome } from '../core/secrets.ts';

/**
 * Hub mode (#83): when this dev server is reachable from outside the machine (a non-loopback --host, or
 * tailscale serve / any proxy forwarding to it), a remote request must be checked before it reaches a
 * route: it may ingest events with a token, may read the UI only when its tailnet identity is a viewer,
 * and may touch nothing else. Remote file reads and voice are refused outright: they act on the host.
 */
export interface HubOptions {
  hub: boolean;
  ingestOnly: boolean;
  home: string;
  legacy?: string;
}

const flag = (v: string | undefined) => /^(1|true|yes)$/i.test(v ?? '');

/** Hub options from the environment, which is how bin/flow-tower.js passes its flags (Vite has no argv). */
export const hubOptionsFromEnv = (env: NodeJS.ProcessEnv = process.env): HubOptions => ({
  hub: hubMode(),
  ingestOnly: flag(env.FLOW_TOWER_INGEST_ONLY),
  home: userHome(),
  legacy: env.FLOW_TOWER_TOKEN,
});

/**
 * The path as a router sees it (#83). Connect matches mounts case-insensitively and by prefix, and the URL
 * parser leaves repeated slashes and percent-escapes alone, so /API/file, /api//file and /api%2ffile all
 * reached /api/file. Normalising before classifying makes the guard's decision match the route's behaviour.
 */
export function normalizePath(raw: string): string {
  let path = raw;
  try { path = decodeURIComponent(path); } catch { /* a malformed escape must not throw: classify it as sent */ }
  // Until stable: removing a dot segment can leave a "//" behind (/api/./file), which must collapse too.
  for (let prev = ''; prev !== path;) {
    prev = path;
    path = path
      .replace(/\/{2,}/g, '/') // connect collapses nothing: /api//file still reached the route
      .replace(/\.+(\/|$)/g, '$1'); // some stacks strip a trailing dot before routing, a plain compare did not
  }
  return path.toLowerCase(); // mounts are matched case-insensitively
}

/** POST /api/events and the OTLP receivers: the only routes a remote sender may use. */
const isIngest = (method: string | undefined, path: string) =>
  method === 'POST' && (path === '/api/events' || /^\/v1\/(logs|metrics|traces)\/?$/.test(path));

/** Routes a remote viewer must never reach, whatever the method: they read host files or drive the mic. */
const SENSITIVE = /^\/api\/(file|voice)(\/|\.|$)/;
/** Vite's own file serving: /@fs/<abs path> reads any file on the host, so a remote viewer gets nothing. */
const isViteFs = (path: string) => path === '/@fs' || path.startsWith('/@fs/');
const isSensitive = (path: string) => SENSITIVE.test(path) || isViteFs(path);

/** A remote read: the UI, its assets and every read endpoint (workspace, events, history, version). */
const isViewing = (method: string | undefined, path: string) => (method === 'GET' || method === 'HEAD') && !isSensitive(path);

/** Who may view this hub: the tailnet users listed in <home>/hub.json ({"viewers": ["alice@example.com"]}). */
function viewers(home: string): string[] {
  const file = join(home, 'hub.json');
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { return []; }
  if (cache && cache.mtime === mtime && cache.home === file) return cache.list;
  let list: string[] = [];
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { viewers?: unknown };
    list = Array.isArray(raw.viewers) ? raw.viewers.filter((v): v is string => typeof v === 'string') : [];
  } catch { /* missing or hand-edited: nobody is a viewer, never a crash */ }
  cache = { home: file, mtime, list };
  return list;
}
let cache: { home: string; mtime: number; list: string[] } | undefined;

/**
 * The tailnet user behind this request, if it may view the hub (#83). Tailscale serve sets
 * tailscale-user-login for the tailnet user and connects from loopback: the header is trusted only then,
 * since on a --host bind anyone on the network could send it. Shared by the guard and the upgrade check.
 */
export function viewerOf(req: IncomingMessage, home: string): string | undefined {
  const who = req.headers['tailscale-user-login'];
  if (isLoopback(req.socket?.remoteAddress) && typeof who === 'string' && viewers(home).includes(who)) return who;
  return undefined;
}

/** Is this request a listed viewer coming through the local proxy? */
export const isViewer = (req: IncomingMessage, home: string): boolean => viewerOf(req, home) !== undefined;

/**
 * May this WebSocket upgrade proceed (#83)? Vite answers HMR/ws on the http server directly, so the
 * connect middlewares never see it; the same rule as the guard decides here. The machine's own browser
 * and a listed viewer through the local proxy are allowed; --ingest-only serves no UI at all, so no socket.
 */
export function allowUpgrade(req: IncomingMessage, opts: HubOptions): boolean {
  if (opts.ingestOnly) return false;
  if (!opts.hub) return true; // hub mode off: Vite's own dev behaviour, unchanged
  if (!isRemote(req, { hub: true })) return true;
  return isViewer(req, opts.home);
}

/**
 * The first middleware of the server in hub mode. It runs before every route and decides from the socket,
 * the proxy headers and the hub.json alone: one place to read for "what can a remote request do".
 */
export function hubGuard(opts: HubOptions) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = normalizePath(new URL(req.url ?? '', 'http://local').pathname);
    const ingest = isIngest(req.method, path);
    // --ingest-only is a public fallback: it must serve nothing but ingest, to anyone, locally too.
    if (opts.ingestOnly && !ingest) return deny(res, 404, { error: 'not found' });
    if (ingest) {
      // A remote sender has no other identity than a token: the hub's own check would answer the same,
      // but this keeps an unsigned body from being read at all. --ingest-only is public, so even a local
      // request is treated as remote there: every ingest must carry a valid token.
      if ((opts.hub && isRemote(req, { hub: opts.hub })) || opts.ingestOnly) {
        const authz = authorize(req, { legacy: opts.legacy, home: opts.home, hub: opts.hub, ingestOnly: opts.ingestOnly });
        if (!authz.ok) return deny(res, 401, { error: 'bad or missing token' });
      }
      return next();
    }
    if (!isRemote(req, { hub: opts.hub })) return next(); // local requests keep today's behaviour
    if (isViewing(req.method, path)) {
      if (isViewer(req, opts.home)) return next();
      return deny(res, 403, { error: 'remote viewing is not allowed for this user (see viewers in hub.json on the hub)' });
    }
    return deny(res, 403, { error: 'remote requests may only ingest events' });
  };
}

/** A short JSON refusal, same shape as the routes: a remote probe learns nothing else. */
function deny(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
