/**
 * Telling a voice from a fan (#68 follow-up). Pure functions, unit-tested (tests/voice-noise.test.ts);
 * mic.ts feeds them the spectrum of each 40 ms tick.
 *
 * A tick is speech when the voice band (300–3400 Hz) is louder than its own adaptive floor AND its spectrum
 * is peaky. The spectrum is first divided bin by bin by the noise floor (whitened), so a fan with a tilted
 * spectrum looks flat too; then spectral flatness (geometric / arithmetic mean of power) separates the two:
 * steady noise stays near 0.65–0.95 after whitening, voiced speech (harmonics under formants) 0.13–0.25.
 * Figures from a simulation of the AnalyserNode (Blackman window, fftSize 2048, smoothing 0.8, 40 ms ticks)
 * on white, pink and brown noise, a fan (pink + 120/480 Hz tones) and harmonic speech at f0 140 and 220 Hz.
 */
export type Sensitivity = 'low' | 'normal' | 'high';

export const VOICE_BAND: [lo: number, hi: number] = [300, 3400];

/**
 * - ratio: band power over its floor (power, not amplitude: 6 ≈ the old 2.5× RMS rule).
 * - flatness: whitened flatness must stay below this (speech ≤ 0.25, fans ≥ 0.65 in the simulation).
 * - minDb: absolute band power (dBFS per bin, as the analyser reports it); speech at 0.02 RMS ≈ -65 dB.
 * Low is for noisy laptops: louder, clearer speech needed. High is for quiet rooms and soft voices.
 */
export const SENSITIVITY: Record<Sensitivity, { ratio: number; flatness: number; minDb: number }> = {
  low: { ratio: 10, flatness: 0.3, minDb: -60 },
  normal: { ratio: 6, flatness: 0.4, minDb: -66 },
  high: { ratio: 3, flatness: 0.5, minDb: -72 },
};

/** Spectral flatness of linear powers: 1 for a flat spectrum, near 0 for a few peaks. Silence counts as flat. */
export function flatness(powers: ArrayLike<number>): number {
  let sum = 0;
  let logSum = 0;
  for (let i = 0; i < powers.length; i++) {
    const p = Math.max(powers[i], 1e-20);
    sum += p;
    logSum += Math.log(p);
  }
  if (!powers.length || sum <= powers.length * 1e-20) return 1;
  return Math.exp(logSum / powers.length) / (sum / powers.length);
}

/** One tick's decision: loud enough over the floor, above the absolute minimum, and not flat like noise. */
export function isSpeech(bandPower: number, floor: number, flat: number, sensitivity: Sensitivity = 'normal') {
  const t = SENSITIVITY[sensitivity];
  return bandPower > Math.max(10 ** (t.minDb / 10), floor * t.ratio) && flat < t.flatness;
}

/** dB from getFloatFrequencyData to linear power; -Infinity (digital silence) becomes a tiny power. */
export const dbToPower = (db: number) => 10 ** (Math.max(db, -160) / 10);

/**
 * The per-bin noise floor stays in [-120, -55] dB: never 0 (the 4× rise per tick could not lift it), and
 * never as loud as a voice close to the mic (speech at 0.02 RMS is about -65 dB, so a cap at -55 dB
 * only bites when calibration heard someone talking loudly).
 */
export const FLOOR_MIN = dbToPower(-120);
export const FLOOR_MAX = dbToPower(-55);
const clampFloor = (p: number) => Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, Number.isFinite(p) ? p : FLOOR_MIN));

/**
 * One tick of the per-bin floor, in place:
 * - 'seed': take this tick as the floor (the first ticks, so it is never 0);
 * - 'min': calibration, keep the per-bin minimum: speech has gaps between syllables and only raises
 *   bins for a moment, so the minimum is the room, not the voice (an average would learn the voice);
 * - a rate: follow the room; one tick can raise a bin 4× at most, so a voice is not learned as noise.
 */
export function updateFloor(floor: Float64Array, band: ArrayLike<number>, step: 'seed' | 'min' | number) {
  for (let i = 0; i < floor.length; i++) {
    const b = clampFloor(band[i]);
    if (step === 'seed') floor[i] = b;
    else if (step === 'min') floor[i] = Math.min(clampFloor(floor[i]), b);
    else floor[i] = clampFloor(floor[i] + step * (Math.min(b, floor[i] * 4) - floor[i]));
  }
}

/**
 * What Whisper writes for noise or silence (it was trained on subtitled video): a transcript that is only
 * one of these is dropped before it is handled or journaled. Compared without case, accents or punctuation.
 */
const HALLUCINATIONS = [
  /^(grazie|grazie mille|grazie a tutti|grazie per (la visione|l attenzione|aver guardato|averci seguito))$/,
  /^(thank you|thank you (so|very) much|thanks|thank you for watching|thanks for watching|you)$/,
  /^sottotitol/, /amara org/, /^(subtitles|captions|sous titres) (by|realises)/, /^(musica|music|applausi|applause)$/,
];

export function isHallucination(text: string) {
  const t = text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return !t || HALLUCINATIONS.some((r) => r.test(t));
}
