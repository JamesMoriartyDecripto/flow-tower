/**
 * Sharing controls on a satellite (#91): the pause switch and the "does it reach the hub?" test. Both act
 * on the local relay and on <home>/config.json, so a restart keeps the user's choice. Guarded like any
 * other local write: no other page, no remote viewer, and no non-JSON body may flip the switch.
 *
 * Two handlers, mounted at their own exact path by plugin.ts: `/api/sharing/test` first, then the pause
 * control at `/api/sharing`. connect() matches a mount by prefix, so mounting the control at
 * `/api/sharing` also delivers `/api/sharing/test` to it (as `/test`): each handler therefore answers
 * only its own root, and calls next() for anything else.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite, isJson } from './guard.ts';
import { isRemote } from './auth.ts';
import { writeUserConfig } from './user-config.ts';
import type { RelayState } from './relay.ts';
import type { ShareSync } from './share-sync.ts';

interface Relay {
  state(): RelayState;
  pause(): void;
  resume(): void;
  sendTest(): Promise<RelayState>;
}

export interface SharingOptions {
  /** The user folder holding config.json. */
  home: string;
  /**
   * The relay of this server, read on every request: the supervisor builds it later when the user connects,
   * so a value captured at start would stay undefined. Undefined when this server is not a satellite.
   */
  relay: () => Relay | undefined;
  /** The shared-towers sync beside the relay (#164), when it runs: its state joins the GET answer. */
  sync: () => Pick<ShareSync, 'state'> | undefined;
  /** Hub mode as the server knows it: a remote request is refused whenever it counts as remote. */
  hub: boolean;
}

/** The pause body is `{ paused }` at most: cap it so a huge POST cannot be buffered whole (like events.ts). */
const MAX_BODY = 16 * 1024;

/**
 * One JSON body, or undefined when the request carries none or something unparseable. The body is capped
 * at MAX_BODY; a bigger one answers 413 itself and resolves undefined, so the caller answers nothing.
 */
async function readBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) { send(res, 413, { error: 'body too large' }); req.destroy(); return undefined; }
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return undefined; }
}

/** The state answer, shared by every route here. Never carries the token. */
const stateOf = (relay?: Relay, sync?: Pick<ShareSync, 'state'>) => {
  if (!relay) return { state: 'off' };
  // The towers field is only there when the sync runs: a satellite without shares still answers the relay state.
  return sync ? { ...relay.state(), towers: sync.state() } : relay.state();
};

/** The path connect left after stripping the mount: a mount root is '' or '/', anything else is another route. */
const isMountRoot = (url: string | undefined) => {
  const path = (url ?? '').split('?')[0];
  return path === '' || path === '/';
};

export function sharingHandler({ home, relay, sync, hub }: SharingOptions) {
  /**
   * A local control: another page must not reach it, a remote viewer must not either. A remote viewer's
   * page still polls the state every 5 s: its GET gets a quiet { state: 'off' } (the chip stays hidden and
   * nothing about this server's relay leaks) instead of a 403 that fills the console (#166).
   */
  const allowed = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (crossSite(req)) { send(res, 403, { error: 'cross-site requests are refused' }); return false; }
    if (isRemote(req, { hub })) {
      if (req.method === 'GET') send(res, 200, { state: 'off' });
      else send(res, 403, { error: 'remote requests are refused' });
      return false;
    }
    return true;
  };

  /** POST /api/sharing/test: one probe event, flushed now so the answer is the hub's own. */
  const test = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!isMountRoot(req.url)) return next();
    if (!allowed(req, res)) return;
    if (req.method !== 'POST') return send(res, 200, stateOf(relay(), sync()));
    // A body that is not JSON is refused before it is read (a form post could otherwise reach this route).
    if (!isJson(req)) return send(res, 415, { error: 'content-type must be application/json' });
    const current = relay();
    if (!current) return send(res, 404, { state: 'off' });
    return send(res, 200, await current.sendTest());
  };

  /** POST /api/sharing: the pause switch. Answers only the mount root, never a shadowed subpath. */
  const control = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!isMountRoot(req.url)) return next();
    if (!allowed(req, res)) return;
    if (req.method !== 'POST') return send(res, 200, stateOf(relay(), sync()));
    if (!isJson(req)) return send(res, 415, { error: 'content-type must be application/json' });
    if (!relay()) return send(res, 404, { state: 'off' });

    const body = (await readBody(req, res)) as { paused?: unknown } | undefined;
    if (res.writableEnded) return; // 413 was already sent for an oversize body
    if (typeof body?.paused !== 'boolean') return send(res, 400, { error: 'expected { paused: boolean }' });
    // Persist first: the choice must survive a restart even if the relay object were ever recreated.
    try { writeUserConfig(home, { paused: body.paused }); } catch { /* an unwritable home still pauses now */ }
    const current = relay();
    if (!current) return send(res, 404, { state: 'off' });
    if (body.paused) current.pause(); else current.resume();
    return send(res, 200, current.state());
  };

  return { control, test };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
