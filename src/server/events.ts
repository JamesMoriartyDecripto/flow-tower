import type { IncomingMessage, ServerResponse } from 'node:http';
import { FlowEventSchema, resolveTargets, type FlowEvent } from '../core/events.ts';
import { normalize } from '../core/adapters.ts';
import { otlpLogsToEvents } from '../core/otlp.ts';
import type { Workspace } from '../core/types.ts';
import { crossSite, isJson } from './guard.ts';

export const EVENTS_EVENT = 'flow-tower:events';
const MAX_BODY = 1_000_000;
const KEEP = 2000;
/** Each event is matched against every node of the library: a huge batch would stall the dev server. */
const MAX_BATCH = 1000;
/** OTLP batches carry many records we ignore (prompts, tool results): allow more bytes, keep only usage. */
const MAX_OTLP_BODY = 4_000_000;

/**
 * In-memory live event hub: validates, normalizes and maps incoming events onto tower nodes,
 * keeps the last KEEP for late joiners and hands new ones to `broadcast`.
 */
export function createEventHub(getWorkspace: () => Workspace | undefined, broadcast: (events: FlowEvent[]) => void, token?: string) {
  const buffer: FlowEvent[] = [];
  let seq = 0;

  /** `tower`: restricts matching for events that do not say it themselves (?tower= on hook URLs). */
  const ingest = (raw: unknown, source?: string, tower?: string): { accepted: number; rejected: number } => {
    const ws = getWorkspace();
    const items = Array.isArray(raw) ? raw : [raw];
    const out: FlowEvent[] = [];
    let rejected = 0;
    for (const item of items.flatMap((x) => normalize(source, x))) {
      const parsed = FlowEventSchema.safeParse(tower ? { tower, ...(item as object) } : item);
      if (!parsed.success) { rejected++; continue; }
      const e = parsed.data;
      out.push({ ...e, id: ++seq, ts: e.ts ?? Date.now(), targets: ws ? resolveTargets(ws, e) : [] });
    }
    buffer.push(...out);
    if (buffer.length > KEEP) buffer.splice(0, buffer.length - KEEP);
    if (out.length) broadcast(out);
    return { accepted: out.length, rejected };
  };

  /** POST /api/events (JSON object or array; ?source= picks an adapter, ?tower= restricts matching). GET returns the buffer. */
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '', 'http://local');
    if (req.method === 'GET' && crossSite(req)) return json(res, 403, { error: 'cross-site requests are refused' });
    if (req.method === 'GET') return json(res, 200, buffer.filter((e) => e.id > Number(url.searchParams.get('since') ?? 0)));
    if (req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
    // A JSON content type forces a CORS preflight, and other sites are refused outright (src/server/guard.ts).
    if (!isJson(req)) return json(res, 415, { error: 'content-type must be application/json' });
    if (crossSite(req)) return json(res, 403, { error: 'cross-site requests are refused' });
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
        const result = ingest(body, sourceOf(req, url), url.searchParams.get('tower') ?? undefined);
        // Claude Code HTTP hooks read a JSON body as a hook decision: answer with an empty 204 by default.
        if (url.searchParams.has('verbose')) json(res, 202, result);
        else { res.statusCode = 204; res.end(); }
      } catch {
        json(res, 400, { error: 'invalid JSON' });
      }
    });
  };

  /**
   * OTLP/HTTP JSON receiver: /v1/logs carries tokens and cost (see core/otlp.ts); /v1/metrics and
   * /v1/traces are accepted and dropped, so exporters configured for every signal do not log errors.
   */
  const otlp = (signal: 'logs' | 'metrics' | 'traces') => (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'use POST' });
    const type = req.headers['content-type'] ?? '';
    if (type.includes('protobuf')) return json(res, 415, { error: 'set OTEL_EXPORTER_OTLP_PROTOCOL=http/json (protobuf is not supported)' });
    if (!isJson(req)) return json(res, 415, { error: 'content-type must be application/json' });
    if (crossSite(req)) return json(res, 403, { error: 'cross-site requests are refused' });
    if (token && req.headers['x-flow-tower-token'] !== token) return json(res, 401, { error: 'bad or missing x-flow-tower-token' });
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_OTLP_BODY) { json(res, 413, { error: 'body too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (signal === 'logs') ingest(otlpLogsToEvents(body).slice(0, MAX_BATCH));
        json(res, 200, {}); // ExportLogsServiceResponse / ExportMetricsServiceResponse / ExportTraceServiceResponse
      } catch {
        json(res, 400, { error: 'invalid JSON' });
      }
    });
  };

  return { ingest, handle, otlp, recent: () => buffer };
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
