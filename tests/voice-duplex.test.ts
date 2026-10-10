import { beforeEach, describe, expect, it } from 'vitest';
import { bargeIn, isEcho, keepClip, playbackOff, playbackOn, playedDuring, resetPlayback, TAIL_MS } from '../src/app/voice/duplex';

/** The agent must not answer its own voice: clips are judged on when they were recorded. */
describe('half-duplex voice', () => {
  beforeEach(() => {
    resetPlayback();
    playbackOn(1000); // a reply plays from 1 s to 4 s
    playbackOff(4000);
  });

  it('drops a clip recorded during playback (or its tail) unless interrupting by voice is on', () => {
    expect(keepClip({ from: 2000, to: 3000 }, false)).toBe(false);
    expect(keepClip({ from: 4000 + TAIL_MS - 100, to: 5600 }, false)).toBe(false); // the room still rings
    expect(keepClip({ from: 2000, to: 3000 }, true)).toBe(true);
    expect(keepClip({ from: 4000 + TAIL_MS + 100, to: 6000 }, false)).toBe(true); // the user after the reply
    expect(keepClip({ from: 200, to: 900 }, false)).toBe(true); // before it
  });

  it('tells the reply itself from its tail (barge-in rule, hint)', () => {
    const tailOnly = { from: 4000 + TAIL_MS - 100, to: 5600 };
    expect(playedDuring(tailOnly)).toBe(true);
    expect(playedDuring(tailOnly, 0)).toBe(false);
    expect(playedDuring({ from: 3500, to: 4500 }, 0)).toBe(true);
  });

  it('tells the silent wait for synthesis from audio actually playing (barge-in rule)', () => {
    playbackOn(10_000); // a reply starts: its first sentence is being synthesized
    playbackOn(11_000, 'audible'); // and plays from 11 s to 12 s
    playbackOff(12_000, 'audible');
    playbackOff(12_500);
    expect(playedDuring({ from: 10_100, to: 10_800 }, 0)).toBe(true); // active: dropped in half-duplex
    expect(playedDuring({ from: 10_100, to: 10_800 }, 0, 'audible')).toBe(false); // no 3-word rule with barge-in
    expect(playedDuring({ from: 11_200, to: 11_800 }, 0, 'audible')).toBe(true);
  });

  it('treats a reply still playing as open-ended', () => {
    playbackOn(10_000);
    expect(playedDuring({ from: 60_000, to: 61_000 })).toBe(true);
    playbackOff(62_000);
    expect(playedDuring({ from: 70_000, to: 71_000 })).toBe(false);
  });

  it('recognizes the echo by the recording time, even when the transcript arrives later', () => {
    const said = 'Il primo livello riceve le issue. Poi il triage le smista.';
    // Recorded at 3 s, transcribed long after the reply ended: still our own voice.
    expect(isEcho('poi il triage le smista', said, { from: 3000, to: 3800 })).toBe(true);
    // The same words recorded after the reply are the user repeating them.
    expect(isEcho('poi il triage le smista', said, { from: 9000, to: 9800 })).toBe(false);
    expect(isEcho('apri il livello tre', said, { from: 3000, to: 3800 })).toBe(false);
  });

  it('barges in on real words or a stop word, not on a cough', () => {
    expect(bargeIn('basta')).toBe('stop');
    expect(bargeIn('ok')).toBe('ignore');
    expect(bargeIn('no aspetta il terzo')).toBe('interrupt');
  });
});
