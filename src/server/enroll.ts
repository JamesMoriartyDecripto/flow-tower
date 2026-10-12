import type { IncomingMessage, ServerResponse } from 'node:http';
import { crossSite, isJson } from './guard.ts';
import { viewerOf } from './hub.ts';
import { tokenStore } from './tokens.ts';

/**
 * POST /api/hub/enroll (#164): a viewer's machine gets its own hub token without anyone copying one by hand.
 * `flow-tower connect https://<hub>.ts.net` calls it. Tailscale serve adds the tailnet login, so only a listed
 * viewer on a tailnet name can enrol; every other path is refused before the token store is touched.
 */
export interface EnrollOptions {
  /** The user folder holding config.json (viewers) and tokens.json. */
  home: string;
  /** Hub mode as the caller knows it: off means this server is not a hub, so the route does not exist. */
  hub: boolean;
}

/** The body is `{ "machine": "<id>" }`: a few bytes. A bigger one is refused, never buffered whole. */
const MAX_BODY = 4 * 1024;
/** The same slug the token store accepts, checked here too so a bad id answers 400, not a store error. */
const MACHINE = /^[a-z0-9-]{1,32}$/;

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

/**
 * The host of a Host header without its port, in lower case. A bracketed IPv6 literal keeps its brackets, and
 * its port (if any) comes after the closing one; any other host loses a trailing `:digits`.
 */
export function hostnameOf(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith('[')) return h.replace(/^(\[[^\]]*\]):\d+$/, '$1');
  return h.replace(/:\d+$/, '');
}

const hostname = (req: IncomingMessage): string => hostnameOf(req.headers.host ?? '');

/** One JSON body under MAX_BODY, or undefined after a 413 was sent. Unparseable JSON comes back as undefined too. */
async function readBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) { send(res, 413, { error: 'body too large' }); req.destroy(); return undefined; }
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

export function enrollHandler({ home, hub }: EnrollOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!hub) return send(res, 404, { error: 'not a hub' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (crossSite(req)) return send(res, 403, { error: 'cross-site requests are refused' });
    if (!isJson(req)) return send(res, 415, { error: 'body must be application/json' });
    // Tailscale serve only serves *.ts.net names: any other Host means this hub is not on the tailnet.
    if (!hostname(req).endsWith('.ts.net')) return send(res, 403, { error: 'enrolment needs a tailnet hub (tailscale serve)' });
    const login = viewerOf(req, home);
    if (!login) return send(res, 403, { error: 'your tailnet login is not a viewer of this hub' });

    const body = await readBody(req, res);
    if (res.writableEnded || body === undefined) return;
    const machine = (body as { machine?: unknown } | null)?.machine;
    if (typeof machine !== 'string' || !MACHINE.test(machine)) return send(res, 400, { error: 'machine must be 1-32 characters of a-z, 0-9 or -' });

    try {
      const { token, rotated } = tokenStore(home).enroll(machine, login);
      return send(res, 200, { token, machine, rotated });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // The conflict text names only the machine id, never the other login: a stranger learns nothing new.
      if (message.startsWith('conflict:')) return send(res, 409, { error: message });
      return send(res, 500, { error: 'enrolment failed' });
    }
  };
}
