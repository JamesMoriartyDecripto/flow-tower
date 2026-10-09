// Meta webhook receiver for Instagram, Facebook and Threads (comments, mentions, messages).
// Verifies X-Hub-Signature-256 on the raw body, answers 200 fast and queues each change for
// triage. Meta does not store notifications, so every item is persisted before acknowledging.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const inbox = new Queue('inbox', { connection: new IORedis(env.REDIS_URL!, { maxRetriesPerRequest: null }) });

// GET: subscription handshake from the App Dashboard.
export function verify(url: URL): Response {
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env.META_VERIFY_TOKEN;
  return ok ? new Response(url.searchParams.get('hub.challenge')) : new Response('forbidden', { status: 403 });
}

function validSignature(raw: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', env.META_APP_SECRET!).update(raw).digest('hex');
  const a = Buffer.from(header.slice(7), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST: notifications.
export async function receive(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });

  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // field: comments | mentions | live_comments (Instagram), feed (Facebook), replies (Threads)
      const id = change.value?.id ?? change.value?.comment_id ?? `${entry.id}:${entry.time}`;
      await inbox.add(change.field, { platform: body.object, accountId: entry.id, ...change.value }, { jobId: `meta:${id}` });
    }
    for (const msg of entry.messaging ?? []) {
      // DMs: the 24h reply window starts at msg.timestamp.
      await inbox.add('dm', { platform: body.object, accountId: entry.id, ...msg }, { jobId: `meta:dm:${msg.message?.mid}` });
    }
  }
  return new Response('ok');
}
