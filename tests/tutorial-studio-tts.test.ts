import { describe, expect, it } from 'vitest';
import { silence, wavFromPcm } from '../examples/tutorial-studio/tts/wav.mjs';
import { estimateSeconds, silent } from '../examples/tutorial-studio/tts/silent.mjs';

const LONG_TEXT = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');

describe('wavFromPcm', () => {
  it('writes a canonical 44-byte header before the samples', () => {
    const wav = wavFromPcm(Buffer.alloc(8));
    expect(wav.length).toBe(52);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + 8);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(8);
  });
});

describe('silence', () => {
  it('holds one second of 16-bit mono samples at 24 kHz', () => {
    expect(silence(1).length).toBe(44 + 48000);
  });
});

describe('estimateSeconds', () => {
  it('uses 2.5 words a second', () => {
    expect(estimateSeconds('one two three four five')).toBe(2);
  });

  it('never goes below 1.5 seconds', () => {
    expect(estimateSeconds('hi')).toBe(1.5);
  });

  it('does not count empty strings from extra spaces as words', () => {
    expect(estimateSeconds('  a  b  ')).toBe(1.5);
  });
});

describe('silent engine', () => {
  it('describes itself', () => {
    expect(silent.describe()).toEqual({ engine: 'silent' });
  });

  it('generates a clip of 10 seconds for 25 words', async () => {
    const wav = await silent.generate(LONG_TEXT);
    expect(wav.readUInt32LE(40)).toBe(10 * 48000);
  });
});
