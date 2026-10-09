import type { CollectionConfig } from 'payload';

/**
 * Payload collections (excerpt). Payload runs inside the Next.js app on Vercel Functions,
 * with the Postgres adapter on Neon (eu-central-1). Content is public to read; enquiries and
 * orders hold PII and are readable by editors only.
 */
const isEditor = ({ req }: { req: { user?: unknown } }) => Boolean(req.user);

export const Products: CollectionConfig = {
  slug: 'products',
  admin: { useAsTitle: 'name' },
  versions: { drafts: true },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'origin', type: 'text' },
    { name: 'tastingNotes', type: 'array', fields: [{ name: 'note', type: 'text', localized: true }] },
    { name: 'stripePriceId', type: 'text', required: true, admin: { description: 'Test-mode price until launch' } },
    { name: 'subscriptionPriceId', type: 'text' },
    { name: 'inStock', type: 'checkbox', defaultValue: true },
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
  ],
};

export const Enquiries: CollectionConfig = {
  slug: 'enquiries',
  access: { read: isEditor, create: () => false, update: isEditor, delete: isEditor }, // created only by the API route
  fields: [
    { name: 'kind', type: 'select', options: ['contact', 'wholesale'], required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
    { name: 'company', type: 'text' },
    { name: 'message', type: 'textarea', required: true },
  ],
};

export const Orders: CollectionConfig = {
  slug: 'orders',
  access: { read: isEditor, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'stripeEventId', type: 'text', required: true, unique: true }, // idempotency key
    { name: 'stripeSessionId', type: 'text', required: true },
    { name: 'email', type: 'email' },
    { name: 'amountTotal', type: 'number' },
    { name: 'currency', type: 'text' },
  ],
};
