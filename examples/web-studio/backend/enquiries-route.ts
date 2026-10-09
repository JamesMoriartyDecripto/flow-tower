// apps/web/src/app/api/enquiries/route.ts — Vercel Functions (Node.js runtime).
import { env } from 'node:process';
import { Resend } from 'resend';
import { z } from 'zod';
import { getPayload } from 'payload';
import config from '@payload-config';

const resend = new Resend(env.RESEND_API_KEY);

const Body = z.object({
  kind: z.enum(['contact', 'wholesale']),
  name: z.string().min(1).max(120),
  email: z.email(),
  company: z.string().max(160).optional(),
  message: z.string().min(1).max(4000),
  turnstileToken: z.string(),
});

/** Cloudflare Turnstile server-side check: the browser token alone proves nothing. */
async function human(token: string, ip: string | null): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token, ...(ip ? { remoteip: ip } : {}) }),
  });
  return ((await res.json()) as { success: boolean }).success;
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { turnstileToken, ...enquiry } = parsed.data;
  if (!(await human(turnstileToken, request.headers.get('x-forwarded-for')))) {
    return Response.json({ error: 'verification failed' }, { status: 400 });
  }

  const payload = await getPayload({ config });
  await payload.create({ collection: 'enquiries', overrideAccess: true, data: enquiry });

  await resend.emails.send({
    from: 'Nordlicht website <web@nordlicht-coffee.example>',
    to: enquiry.kind === 'wholesale' ? 'wholesale@nordlicht-coffee.example' : 'hello@nordlicht-coffee.example',
    replyTo: enquiry.email,
    subject: `[${enquiry.kind}] ${enquiry.company ?? enquiry.name}`,
    text: enquiry.message,
  });
  return new Response(null, { status: 201 });
}
