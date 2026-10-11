/**
 * Sharing controls on a satellite (#91): the pause switch and the "does it reach the hub?" test. Both act
 * on the local relay and on <home>/config.json, so a restart keeps the user's choice. Guarded like any
 * other local write: no other page, no remote viewer, and no non-JSON body may flip the switch.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite, isJson } from './guard.ts';
import { isRemote } from './auth.ts';
import { writeUserConfig } from './user-config.ts';
import type { RelayState } from './relay.ts';

interface Relay {
  state(): RelayState;
  pause(): void;
  resume(): void;
  sendTest(): Promise<RelayState>;
}

export interface SharingOptions {
  /** The user folder holding config.json. */
  home: string;
  /** The relay of this server, or undefined when this server is not a satellite. */
  relay?: Relay;
  /** Hub mode as the server knows it: a remote request is refused whenever it counts as remote. */
  hub: boolean;
}

/** One JSON body, or undefined when the request carries none or something unparseable. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return undefined; }
}

/** The state answer, shared by every route here. Never carries the token. */
const stateOf = (relay?: Relay) => relay?.state() ?? { state: 'off' };

export function sharingHandler({ home, relay, hub }: SharingOptions) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // A local control: another page must not reach it, a remote viewer must not either, and a body that
    // is not JSON is refused before it is read (a form post could otherwise reach an endpoint like this).
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (isRemote(req, { hub })) return send(res, 403, { error: 'remote requests are refused' });
    // connect() strips the mount prefix (req.url is then '/test'), but a direct call keeps it: take both.
    const test = /^\/(?:api\/sharing)?\/test\b/.test(req.url ?? '');
    if (req.method !== 'POST') return send(res, 200, stateOf(relay));
    if (!isJson(req)) return send(res, 415, { error: 'content-type must be application/json' });
    if (!relay) return send(res, 404, { state: 'off' });

    if (test) return send(res, 200, await relay.sendTest());

    const body = (await readBody(req)) as { paused?: unknown } | undefined;
    if (typeof body?.paused !== 'boolean') return send(res, 400, { error: 'expected { paused: boolean }' });
    // Persist first: the choice must survive a restart even if the relay object were ever recreated.
    try { writeUserConfig(home, { paused: body.paused }); } catch { /* an unwritable home still pauses now */ }
    if (body.paused) relay.pause(); else relay.resume();
    return send(res, 200, relay.state());
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
