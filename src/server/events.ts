import type { IncomingMessage, ServerResponse } from 'node:http';
import { createGunzip, createInflate } from 'node:zlib';
import { FlowEventSchema, resolveRuntime, resolveTargets, splitTarget, type FlowEvent } from '../core/events.ts';
import { normalize } from '../core/adapters.ts';
import { otlpLogsToEvents } from '../core/otlp.ts';
import type { Workspace } from '../core/types.ts';
import { authorize, hubMode, isRemote, type AuthOptions } from './auth.ts';
import { crossSite, isJson } from './guard.ts';
import { createBucket, createDedupe, eventIdOf, inTimeWindow, type Bucket, type Dedupe } from './limits.ts';
import { userHome } from '../core/secrets.ts';

export const EVENTS_EVENT = 'flow-tower:events';
const MAX_BODY = 1_000_000;
const KEEP = 2000;
/** Each event is matched against every node of the library: a huge batch would stall the dev server. */
const MAX_BATCH = 1000;
/** OTLP batches carry many records we ignore (prompts, tool results): allow more bytes, keep only usage. */
const MAX_OTLP_BODY = 4_000_000;

/** Abuse limits (#83 phase 3), injectable so tests can drive them with a fake clock. */
export interface HubLimits {
  bucket?: Bucket;
  dedupe?: Dedupe;
  /** Injectable clock (tests): epoch milliseconds. */
  clock?: () => number;
}

/**
 * In-memory live event hub: validates, normalizes and maps incoming events onto tower nodes,
 * keeps the last KEEP for late joiners and hands new ones to `broadcast`.
 */
export function createEventHub(getWorkspace: () => Workspace | undefined, broadcast: (events: FlowEvent[]) => void, auth: AuthOptions = { home: userHome() }, limits: HubLimits = {}) {
  const buffer: FlowEvent[] = [];
  const now = limits.clock ?? Date.now;
  const bucket = limits.bucket ?? createBucket({ now });
  const dedupe = limits.dedupe ?? createDedupe();
  let seq = 0;

  /** `tower`: restricts matching for events that do not say it themselves (?tower= on hook URLs). */
  const ingest = (raw: unknown, source?: string, tower?: string, sender?: string): { accepted: number; rejected: number } => {
    const ws = getWorkspace();
    const at = now();
    const items = Array.isArray(raw) ? raw : [raw];
    const out: FlowEvent[] = [];
    let rejected = 0;
    for (const item of items.flatMap((x) => normalize(source, x))) {
      const parsed = FlowEventSchema.safeParse(tower ? { tower, ...(item as object) } : item);
      if (!parsed.success) { rejected++; continue; }
      const e = parsed.data;
      // A replayed or backdated event must not rewrite history: drop it, still answering as usual.
      if (!inTimeWindow(e.ts, at)) { rejected++; continue; }
      const id = eventIdOf(item);
      if (id && dedupe.seen(`${sender ?? ''}:${id}`)) { rejected++; continue; }
      const targets = ws ? resolveTargets(ws, e) : [];
      // The token identity wins over the payload: a sender cannot claim to be someone else.
      const who = sender ? { sender, user: sender } : {};
      out.push({ ...e, ...who, id: ++seq, ts: e.ts ?? at, targets, runtimeRef: ws ? runtimeRefOf(ws, e, targets) : undefined });
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
    const authz = authorize(req, auth);
    if (!authz.ok) return json(res, 401, { error: 'bad or missing token' });
    // A local hook without a token is trusted (the server is never exposed that way): only a sender
    // identity or a request that reached us from off this machine gets its own rate-limit bucket.
    const key = authz.sender ?? (isRemote(req, { hub: auth.hub ?? hubMode() }) ? req.socket?.remoteAddress ?? 'remote' : undefined);
    const encoding = encodingOf(req);
    if (!encoding) return json(res, 415, unknownEncoding());

    void readBody(req, res, MAX_BODY, encoding).then((chunks) => {
      if (!chunks) return; // the response was already sent (413, 400)
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (Array.isArray(body) && body.length > MAX_BATCH) return json(res, 413, { error: `at most ${MAX_BATCH} events per request` });
        // Counted per event, not per request: a huge batch must not slip through as one token.
        if (key && !bucket.take(key, Array.isArray(body) ? body.length : 1)) {
          res.setHeader('Retry-After', String(bucket.retryAfter(key)));
          return json(res, 429, { error: 'too many events, retry later' });
        }
        const result = ingest(body, sourceOf(req, url), url.searchParams.get('tower') ?? undefined, authz.sender);
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
    const authz = authorize(req, auth);
    if (!authz.ok) return json(res, 401, { error: 'bad or missing token' });
    const encoding = encodingOf(req);
    if (!encoding) return json(res, 415, unknownEncoding());
    void readBody(req, res, MAX_OTLP_BODY, encoding).then((chunks) => {
      if (!chunks) return; // the response was already sent (413, 400)
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (signal === 'logs') ingest(otlpLogsToEvents(body).slice(0, MAX_BATCH), undefined, undefined, authz.sender);
        json(res, 200, {}); // ExportLogsServiceResponse / ExportMetricsServiceResponse / ExportTraceServiceResponse
      } catch {
        json(res, 400, { error: 'invalid JSON' });
      }
    });
  };

  return { ingest, handle, otlp, recent: () => buffer };
}

/**
 * Runtime of the first tower the event landed on that recognizes its host/runtime. An event may hit
 * several towers: the first match wins, so a runtimeRef is never set by a tower it does not touch.
 */
function runtimeRefOf(ws: Workspace, event: Parameters<typeof resolveRuntime>[1], targets: string[]): string | undefined {
  for (const target of targets) {
    const tower = ws.towers[splitTarget(target)[0]];
    const ref = tower && resolveRuntime(tower, event);
    if (ref) return ref;
  }
  return undefined;
}

/** Source from ?source=, or sniffed from headers (Hermes webhooks send X-Hermes-Event). */
function sourceOf(req: IncomingMessage, url: URL): string | undefined {
  return url.searchParams.get('source') ?? (req.headers['x-hermes-event'] ? 'hermes' : undefined);
}

/** Content encoding to undo: gzip/deflate are decompressed, identity needs nothing. Undefined means unknown. */
function encodingOf(req: IncomingMessage): 'identity' | 'gzip' | 'deflate' | undefined {
  // One coding only: a stacked list ("gzip, br") is refused rather than half-decoded.
  const parts = (req.headers['content-encoding'] ?? '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length > 1) return undefined;
  const raw = parts[0] ?? '';
  if (!raw || raw === 'identity') return 'identity';
  if (raw === 'gzip' || raw === 'x-gzip') return 'gzip'; // the OTLP Collector sends this by default
  if (raw === 'deflate') return 'deflate';
  return undefined;
}

function unknownEncoding() {
  // A fixed message: the header is not echoed back.
  return { error: 'unsupported content-encoding (use identity, gzip or deflate)' };
}

/**
 * Reads the body, decompressing gzip/deflate as a stream and capping the DECOMPRESSED size: a small
 * payload that inflates past the cap is refused with 413, never buffered whole (a zip bomb).
 * Resolves undefined when the response was already sent.
 */
function readBody(req: IncomingMessage, res: ServerResponse, cap: number, encoding: 'identity' | 'gzip' | 'deflate'): Promise<Buffer[] | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const fail = (status: number, body: unknown) => {
      if (done) return;
      done = true;
      json(res, status, body);
      req.destroy();
      resolve(undefined);
    };
    const source: NodeJS.ReadableStream = encoding === 'identity' ? req : req.pipe(encoding === 'gzip' ? createGunzip() : createInflate());
    source.on('data', (c: Buffer) => {
      size += c.length;
      if (size > cap) return fail(413, { error: 'body too large' });
      chunks.push(c);
    });
    if (encoding !== 'identity') source.on('error', () => fail(400, { error: 'invalid compressed body' }));
    source.on('end', () => { if (!done) { done = true; resolve(chunks); } });
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
