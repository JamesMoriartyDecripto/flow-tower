export const RATE: number;

/** Wraps 16-bit signed little-endian mono PCM in a 44-byte WAV header. */
export function wavFromPcm(pcm: Buffer, rate?: number): Buffer;

/** A WAV clip of the given length in silence. */
export function silence(seconds: number, rate?: number): Buffer;
