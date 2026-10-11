// Dev-server route that receives live events from Claude Code HTTP hooks and other emitters.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseEvents } from './events';
import { publish } from './bus';

const MAX_BODY = 1_000_000;

export async function handleEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) {
      res.writeHead(413).end();
      return;
    }
  }
  const events = parseEvents(body);
  for (const e of events) publish(e);
  // Tell the sender how many events were accepted, so scripts can log it.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, accepted: events.length }));
}
