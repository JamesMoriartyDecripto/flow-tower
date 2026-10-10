import { describe, expect, it } from 'vitest';
import { dbToPower, FLOOR_MAX, FLOOR_MIN, flatness, isHallucination, isSpeech, SENSITIVITY, updateFloor } from '../src/app/voice/noise';

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

describe('noise floor', () => {
  const room = dbToPower(-80);
  const voice = dbToPower(-62);
  const bins = 8;
  const tick = (p: number) => new Array(bins).fill(p);

  it('learns the room, not a voice heard during calibration', () => {
    const floor = new Float64Array(bins);
    updateFloor(floor, tick(voice), 'seed'); // the user talks as the mic opens
    for (const p of [voice, room * 1.2, voice, room, voice]) updateFloor(floor, tick(p), 'min'); // syllables and gaps
    expect([...floor]).toEqual(tick(room));
    // So the first command after calibration is heard.
    expect(isSpeech(voice, room, 0.2)).toBe(true);
  });

  it('is never 0, even on digital silence, and can rise again', () => {
    const floor = new Float64Array(bins);
    updateFloor(floor, tick(dbToPower(-Infinity)), 'seed');
    expect(floor.every((f) => f === FLOOR_MIN)).toBe(true);
    for (let i = 0; i < 400; i++) updateFloor(floor, tick(room), 0.05); // a fan comes on: 16 s
    expect(floor[0]).toBeCloseTo(room, 12);
  });

  it('caps what calibration can learn, and follows the room slowly', () => {
    const floor = new Float64Array(bins);
    updateFloor(floor, tick(dbToPower(-20)), 'seed'); // someone shouting into the mic
    expect(floor[0]).toBe(FLOOR_MAX);
    updateFloor(floor.fill(room), tick(voice), 0.05); // one loud tick: at most 4x, at this rate much less
    expect(floor[0]).toBeLessThan(room * 4);
    expect(floor[0]).toBeGreaterThan(room);
    updateFloor(floor, [NaN, ...tick(room).slice(1)], 0.05);
    expect(Number.isFinite(floor[0])).toBe(true);
  });
});
