import type { IncomingMessage, ServerResponse } from 'node:http';
import { FlowEventSchema, resolveTargets, type FlowEvent } from '../core/events.ts';
import { normalize } from '../core/adapters.ts';
import type { Workspace } from '../core/types.ts';

export const EVENTS_EVENT = 'flow-tower:events';
const MAX_BODY = 1_000_000;
const KEEP = 2000;
/** Each event is matched against every node of the library: a huge batch would stall the dev server. */
const MAX_BATCH = 1000;

/**
 * In-memory live event hub: validates, normalizes and maps incoming events onto tower nodes,
 * keeps the last KEEP for late joiners and hands new ones to `broadcast`.
 */
export function createEventHub(getWorkspace: () => Workspace | undefined, broadcast: (events: FlowEvent[]) => void, token?: string) {
  const buffer: FlowEvent[] = [];
  let seq = 0;

  const ingest = (raw: unknown, source?: string): { accepted: number; rejected: number } => {
    const ws = getWorkspace();
    const items = Array.isArray(raw) ? raw : [raw];
    const out: FlowEvent[] = [];
    let rejected = 0;
    for (const item of items.flatMap((x) => normalize(source, x))) {
      const parsed = FlowEventSchema.safeParse(item);
      if (!parsed.success) { rejected++; continue; }
      const e = parsed.data;
      out.push({ ...e, id: ++seq, ts: e.ts ?? Date.now(), targets: ws ? resolveTargets(ws, e) : [] });
    }
    buffer.push(...out);
    if (buffer.length > KEEP) buffer.splice(0, buffer.length - KEEP);
    if (out.length) broadcast(out);
    return { accepted: out.length, rejected };
  };

  /** POST /api/events (JSON object or array; ?source= picks an adapter). GET returns the buffer. */
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '', 'http://local');
    if (req.method === 'GET') return json(res, 200, buffer.filter((e) => e.id > Number(url.searchParams.get('since') ?? 0)));
    if (req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
    // Requiring a JSON content type forces a CORS preflight, so random web pages cannot post here.
    if (!req.headers['content-type']?.includes('application/json')) return json(res, 415, { error: 'content-type must be application/json' });
    if (token && req.headers['x-flow-tower-token'] !== token) return json(res, 401, { error: 'bad or missing x-flow-tower-token' });

    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { json(res, 413, { error: 'body too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (Array.isArray(body) && body.length > MAX_BATCH) return json(res, 413, { error: `at most ${MAX_BATCH} events per request` });
        const result = ingest(body, sourceOf(req, url));
        // Claude Code HTTP hooks read a JSON body as a hook decision: answer with an empty 204 by default.
        if (url.searchParams.has('verbose')) json(res, 202, result);
        else { res.statusCode = 204; res.end(); }
      } catch {
        json(res, 400, { error: 'invalid JSON' });
      }
    });
  };

  return { ingest, handle, recent: () => buffer };
}

/** Source from ?source=, or sniffed from headers (Hermes webhooks send X-Hermes-Event). */
function sourceOf(req: IncomingMessage, url: URL): string | undefined {
  return url.searchParams.get('source') ?? (req.headers['x-hermes-event'] ? 'hermes' : undefined);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
