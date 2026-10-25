// WAV helpers for the narration clips. Argo reads the header to get each clip's
// duration, so the RIFF and data sizes must match the payload exactly.

export const RATE = 24000;

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 4;

/**
 * Wraps 32-bit IEEE float little-endian mono samples in a canonical 44-byte WAV header.
 * Float, not 16-bit PCM, because Argo decodes every clip with readFloatLE, whatever the
 * header says; a PCM clip decodes to NaN and breaks the export.
 */
export function wavFromFloat(samples, rate = RATE) {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size for the plain format
  header.writeUInt16LE(3, 20); // format 3 = IEEE float
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * BYTES_PER_SAMPLE, 28); // byte rate
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32); // block align
  header.writeUInt16LE(32, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

/** A WAV clip of the given length in silence. Zero bytes are 0.0 in float too. */
export function silence(seconds, rate = RATE) {
  return wavFromFloat(Buffer.alloc(Math.round(seconds * rate) * BYTES_PER_SAMPLE), rate);
}
