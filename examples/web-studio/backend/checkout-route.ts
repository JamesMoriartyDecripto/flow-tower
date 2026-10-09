// apps/web/src/app/api/checkout/route.ts — runs on Vercel Functions (Node.js runtime).
import { env } from 'node:process';
import Stripe from 'stripe';
import { z } from 'zod';
import { getPayload } from 'payload';
import config from '@payload-config';

const stripe = new Stripe(env.STRIPE_SECRET_KEY!); // sk_test_ until the launch checklist flips it

const Body = z.object({
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20) })).min(1),
  subscription: z.boolean().default(false),
  locale: z.enum(['en', 'da', 'de']),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { items, subscription, locale } = parsed.data;

  // Prices come from the CMS, never from the client.
  const payload = await getPayload({ config });
  const { docs } = await payload.find({ collection: 'products', where: { id: { in: items.map((i) => i.productId) } } });
  const lineItems = items.map((item) => {
    const product = docs.find((d) => String(d.id) === item.productId);
    if (!product || !product.inStock) return null;
    const price = subscription ? product.subscriptionPriceId : product.stripePriceId;
    return price ? { price, quantity: item.quantity } : null;
  });
  if (lineItems.some((l) => l === null)) return Response.json({ error: 'unknown or unavailable product' }, { status: 422 });

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: subscription ? 'subscription' : 'payment',
    line_items: lineItems as Stripe.Checkout.SessionCreateParams.LineItem[],
    locale,
    shipping_address_collection: { allowed_countries: ['DK', 'SE', 'DE'] },
    success_url: `${origin}/${locale}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/${locale}/shop`,
  });
  return Response.json({ url: session.url });
}
