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

/** POST /api/events and the OTLP receivers: the only routes a remote sender may use. */
const isIngest = (method: string | undefined, path: string) =>
  method === 'POST' && (path === '/api/events' || /^\/v1\/(logs|metrics|traces)\/?$/.test(path));

/** Routes a remote viewer must never reach, whatever the method: they read host files or drive the mic. */
const isSensitive = (path: string) => path === '/api/file' || path.startsWith('/api/file/') || path === '/api/voice' || path.startsWith('/api/voice/');

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
 * The first middleware of the server in hub mode. It runs before every route and decides from the socket,
 * the proxy headers and the hub.json alone: one place to read for "what can a remote request do".
 */
export function hubGuard(opts: HubOptions) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = new URL(req.url ?? '', 'http://local').pathname;
    const ingest = isIngest(req.method, path);
    // --ingest-only is a public fallback: it must serve nothing but ingest, to anyone, locally too.
    if (opts.ingestOnly && !ingest) return deny(res, 404, { error: 'not found' });
    if (ingest) {
      // A remote sender has no other identity than a token: the hub's own check would answer the same,
      // but this keeps an unsigned body from being read at all.
      if (opts.hub && isRemote(req, { hub: opts.hub })) {
        const authz = authorize(req, { legacy: opts.legacy, home: opts.home, hub: opts.hub });
        if (!authz.ok) return deny(res, 401, { error: 'bad or missing token' });
      }
      return next();
    }
    if (!isRemote(req, { hub: opts.hub })) return next(); // local requests keep today's behaviour
    if (isViewing(req.method, path)) {
      // Tailscale serve sets tailscale-user-login for the tailnet user behind the request, and connects from
      // loopback. The header is trusted only then: on a --host bind anyone on the network could send it.
      const who = req.headers['tailscale-user-login'];
      const viaLocalProxy = isLoopback(req.socket?.remoteAddress);
      if (viaLocalProxy && typeof who === 'string' && viewers(opts.home).includes(who)) return next();
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
