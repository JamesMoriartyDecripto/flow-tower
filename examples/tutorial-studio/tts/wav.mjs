// WAV helpers for the narration clips. Argo reads the header to get each clip's
// duration, so the RIFF and data sizes must match the payload exactly.

export const RATE = 24000;

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

/** Wraps 16-bit signed little-endian mono PCM in a canonical 44-byte WAV header. */
export function wavFromPcm(pcm, rate = RATE) {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size for PCM
  header.writeUInt16LE(1, 20); // format 1 = PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * BYTES_PER_SAMPLE, 28); // byte rate
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** A WAV clip of the given length in silence. */
export function silence(seconds, rate = RATE) {
  return wavFromPcm(Buffer.alloc(Math.round(seconds * rate) * BYTES_PER_SAMPLE), rate);
}
