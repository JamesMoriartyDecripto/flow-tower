// Seeds a Neon preview branch (preview/<git-branch>) so every Vercel preview has realistic,
// PII-free data. Runs in the preview build after `payload migrate`.
import { env } from 'node:process';
import { getPayload } from 'payload';
import config from '@payload-config';

const PRODUCTS = [
  { name: 'Ethiopia Guji Hambela', slug: 'ethiopia-guji-hambela', origin: 'Ethiopia', price: 'price_test_guji_250g' },
  { name: 'Colombia Huila Decaf', slug: 'colombia-huila-decaf', origin: 'Colombia', price: 'price_test_huila_250g' },
  { name: 'Nordlicht House Espresso', slug: 'house-espresso', origin: 'Brazil / Ethiopia', price: 'price_test_house_1kg' },
];

async function main() {
  if (env.VERCEL_ENV === 'production') throw new Error('refusing to seed production');
  const payload = await getPayload({ config });
  const media = await payload.find({ collection: 'media', limit: 1 });
  const imageId = media.docs[0]?.id;
  if (!imageId) throw new Error('seed media missing: run `payload migrate` with the fixtures first');

  for (const p of PRODUCTS) {
    const exists = await payload.find({ collection: 'products', where: { slug: { equals: p.slug } }, limit: 1 });
    if (exists.totalDocs) continue; // idempotent: re-running a preview build is safe
    await payload.create({
      collection: 'products',
      data: { name: p.name, slug: p.slug, origin: p.origin, stripePriceId: p.price, inStock: true, image: imageId },
    });
  }
  console.log(`seeded ${PRODUCTS.length} products on ${env.VERCEL_GIT_COMMIT_REF ?? 'local'}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
