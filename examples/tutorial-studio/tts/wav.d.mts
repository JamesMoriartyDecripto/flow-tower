export const RATE: number;

/** Wraps 32-bit IEEE float little-endian mono samples in a 44-byte WAV header. */
export function wavFromFloat(samples: Buffer, rate?: number): Buffer;

/** A WAV clip of the given length in silence. */
export function silence(seconds: number, rate?: number): Buffer;
