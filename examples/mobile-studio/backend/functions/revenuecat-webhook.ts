// Supabase Edge Function: RevenueCat webhook -> profiles.premium_until.
// The app never decides entitlements; this is the only writer of premium_until.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
// Shared secret configured as the Authorization header value in the RevenueCat dashboard.
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH')!;

type RcEvent = {
  type: string; // INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, ...
  app_user_id: string;
  entitlement_ids: string[] | null;
  expiration_at_ms: number | null;
  environment: 'SANDBOX' | 'PRODUCTION';
};

const GRANTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE']);

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== WEBHOOK_AUTH) return new Response('unauthorized', { status: 401 });

  const { event } = (await req.json()) as { event: RcEvent };
  if (!event.entitlement_ids?.includes('premium')) return new Response('ignored', { status: 200 });

  // EXPIRATION clears access; CANCELLATION keeps it until the period ends.
  const premiumUntil =
    event.type === 'EXPIRATION'
      ? null
      : GRANTS.has(event.type) || event.type === 'CANCELLATION'
        ? event.expiration_at_ms && new Date(event.expiration_at_ms).toISOString()
        : undefined;
  if (premiumUntil === undefined) return new Response('no-op', { status: 200 });

  const { error } = await admin.from('profiles').update({ premium_until: premiumUntil }).eq('id', event.app_user_id);
  // Non-2xx makes RevenueCat retry with backoff; keep the handler idempotent.
  return error ? new Response('db error', { status: 500 }) : new Response('ok', { status: 200 });
});
