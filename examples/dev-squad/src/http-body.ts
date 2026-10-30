import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Byte cap for webhook bodies. Counted on raw bytes before anything is decoded: string length counts
 * UTF-16 units, so a body of multi-byte text could pass a length check while sending far more bytes.
 */
export const MAX_WEBHOOK_BYTES = 1_000_000;

export class BodyTooLarge extends Error {
  constructor() {
    super(`request body exceeds ${MAX_WEBHOOK_BYTES} bytes`);
  }
}

/**
 * Buffers raw chunks and stops at the first one that crosses `limit`. Throwing inside the for-await
 * ends the iteration, which destroys the request, so an oversize sender cannot keep streaming into memory.
 * Read and abort errors reject the promise; the caller decides the response.
 */
export async function readCappedBody(chunks: AsyncIterable<Uint8Array | string>, limit = MAX_WEBHOOK_BYTES): Promise<Buffer> {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > limit) throw new BodyTooLarge();
    parts.push(buf);
  }
  return Buffer.concat(parts, total);
}

/** GitHub signs the raw bytes, so the HMAC runs before any decoding. */
export function verifySignature(raw: Buffer, signature: string | undefined, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
