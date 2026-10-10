import { describe, expect, it } from 'vitest';
import { flatness, isHallucination, isSpeech, SENSITIVITY } from '../src/app/voice/noise';

/** A fan is not a voice: voice-band power over its floor AND a peaky (not flat) spectrum. */
describe('speech or noise', () => {
  const bins = 133; // 300–3400 Hz at 48 kHz / 2048
  // A fan, whitened by its own floor: about 1 in every bin, with a little jitter.
  const fan = Array.from({ length: bins }, (_, i) => 8 * (1 + 0.3 * Math.sin(i * 1.7)));
  // Speech at the same mean power: harmonics every ~6 bins (f0 140 Hz), peaks under formants.
  const raw = Array.from({ length: bins }, (_, i) => (i % 6 === 0 ? 1 : 0.01) * (1 + 3 * Math.exp(-(((i - 40) / 10) ** 2))));
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const voice = raw.map((p) => (p * mean(fan)) / mean(raw));

  it('measures flatness: flat noise near 1, harmonics near 0, silence flat', () => {
    expect(flatness(fan)).toBeGreaterThan(0.9);
    expect(flatness(voice)).toBeLessThan(0.15);
    expect(flatness(new Array(bins).fill(0))).toBe(1);
  });

  it('takes a peaky spectrum for speech and a flat one at the same power for noise', () => {
    const power = 1e-6; // -60 dB: loud enough for every sensitivity
    const floor = power / 20;
    expect(isSpeech(power, floor, flatness(voice))).toBe(true);
    expect(isSpeech(power, floor, flatness(fan))).toBe(false);
  });

  it('needs the band louder than its floor and than an absolute minimum', () => {
    expect(isSpeech(1e-6, 1e-6 / 2, 0.1)).toBe(false); // a voice at the fan's level is not told apart
    expect(isSpeech(1e-9, 1e-12, 0.1)).toBe(false); // -90 dB: a whisper from the next room
  });

  it('orders the sensitivities: low asks more than normal, normal more than high', () => {
    const { low, normal, high } = SENSITIVITY;
    expect(low.ratio > normal.ratio && normal.ratio > high.ratio).toBe(true);
    expect(low.flatness < normal.flatness && normal.flatness < high.flatness).toBe(true);
    expect(low.minDb > normal.minDb && normal.minDb > high.minDb).toBe(true);
    // Between low and normal thresholds: normal hears it, low does not.
    expect(isSpeech(1e-6, 1e-6 / 8, 0.35, 'normal')).toBe(true);
    expect(isSpeech(1e-6, 1e-6 / 8, 0.35, 'low')).toBe(false);
  });
});

describe('Whisper hallucinations on noise', () => {
  it('drops what Whisper writes for silence or a fan', () => {
    for (const t of ['Grazie.', 'Grazie a tutti!', 'grazie per la visione', 'Thank you.', 'Thanks for watching!', 'you', '...', '…',
      'Sottotitoli creati dalla comunità Amara.org', 'Sottotitoli e revisione a cura di QTSS', 'Amara.org', '[Musica]']) {
      expect(isHallucination(t), t).toBe(true);
    }
  });

  it('keeps real commands, even with those words in them', () => {
    for (const t of ['grazie, apri il livello due', 'thank you, show the triage node', 'vai al nodo triage', 'livello 3']) {
      expect(isHallucination(t), t).toBe(false);
    }
  });
});
