// Supabase Edge Function: in-app account deletion (App Store Review Guideline 5.1.1(v)).
// Deletes Storage objects, the auth user (rows cascade) and the RevenueCat customer.
// Subscriptions are not cancelled here: Apple and Google own them; the app links to
// subscription management before the user confirms.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Edge Function secret, never in the app
const RC_SECRET = Deno.env.get('REVENUECAT_SECRET_KEY')!; // Edge Function secret

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // Identify the caller from their own JWT; never trust a user id in the body.
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return new Response('unauthorized', { status: 401 });

  // 1. Photos in Storage (rows would cascade, files would not).
  const bucket = admin.storage.from('plant-photos');
  const { data: files } = await bucket.list(user.id, { limit: 1000 });
  if (files?.length) await bucket.remove(files.map((f) => `${user.id}/${f.name}`));

  // 2. RevenueCat customer (purchase history linked to this user id).
  const rc = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${RC_SECRET}` },
  });
  if (!rc.ok && rc.status !== 404) return new Response('billing cleanup failed', { status: 502 });

  // 3. Auth user; profiles, plants and care_events cascade.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return new Response('delete failed', { status: 500 });

  console.log(JSON.stringify({ event: 'account_deleted', photos: files?.length ?? 0 })); // no user id in logs
  return new Response(null, { status: 204 });
});
