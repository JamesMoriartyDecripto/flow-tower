// apps/web/src/app/api/stripe/webhook/route.ts — Vercel Functions (Node.js runtime).
import { env } from 'node:process';
import Stripe from 'stripe';
import { getPayload } from 'payload';
import config from '@payload-config';

const stripe = new Stripe(env.STRIPE_SECRET_KEY!);

/**
 * Signature-verified and idempotent: Stripe retries deliveries, so the event id is a unique
 * key on the orders collection and a duplicate is acknowledged without side effects.
 * Tested locally and in CI with `stripe trigger checkout.session.completed`.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('bad signature', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') return new Response('ignored', { status: 200 });

  const payload = await getPayload({ config });
  const seen = await payload.find({ collection: 'orders', where: { stripeEventId: { equals: event.id } }, limit: 1 });
  if (seen.totalDocs > 0) return new Response('duplicate', { status: 200 });

  const session = event.data.object;
  await payload.create({
    collection: 'orders',
    overrideAccess: true, // the collection is closed to everyone except this handler
    data: {
      stripeEventId: event.id,
      stripeSessionId: session.id,
      email: session.customer_details?.email ?? undefined,
      amountTotal: session.amount_total ?? undefined,
      currency: session.currency ?? undefined,
    },
  });
  return new Response('ok', { status: 200 });
}
