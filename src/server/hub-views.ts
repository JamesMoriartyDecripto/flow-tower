/**
 * The Hub panel's viewing routes (#92): /api/hub/machines lists one row per sender the hub knows, and
 * /api/hub/me tells the page whether it is the local operator or a remote viewer. Metadata only: a row
 * carries the sender id and a shortened token label, never a token plaintext, a prompt, a message or a
 * path. Both are GET viewing routes, so hub mode's remote-viewer rule (hubGuard) decides who is let in.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite } from './guard.ts';
import { isRemote } from './auth.ts';
import { tokenStore } from './tokens.ts';
import { hubCounts, machineRows } from './machines.ts';
import type { Satellites } from './satellites.ts';

export interface HubViewOptions {
  satellites: Satellites;
  /** The user folder holding tokens.json (never the checkout). */
  home: string;
  /** Hub mode as the caller knows it; isRemote is a no-op otherwise, exactly like the rest of the server. */
  hub: boolean;
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

/** Refuse anything but a GET before reading the store: these routes only ever read. */
const onlyGet = (req: IncomingMessage, res: ServerResponse): boolean => {
  if (req.method === 'GET') return false;
  send(res, 405, { error: 'method not allowed' });
  return true;
};

/**
 * The two read handlers, both behind the crossSite check like /api/hub/satellites and /api/history: a
 * page on this machine must not read the Hub panel, and `no-store` keeps a viewer's browser from caching
 * it. `readOnly` is `isRemote`: whoever reached here off this machine already passed hubGuard as a listed
 * viewer, so they may look but never act; the local operator is never read-only.
 */
export function hubViews({ satellites, home, hub }: HubViewOptions) {
  const machines = (req: IncomingMessage, res: ServerResponse) => {
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (onlyGet(req, res)) return;
    send(res, 200, machineRows(tokenStore(home).list(), satellites.list(), Date.now()));
  };

  const me = (req: IncomingMessage, res: ServerResponse) => {
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (onlyGet(req, res)) return;
    const rows = machineRows(tokenStore(home).list(), satellites.list(), Date.now());
    send(res, 200, { hub, readOnly: isRemote(req, { hub }), ...hubCounts(rows) });
  };

  return { machines, me };
}
