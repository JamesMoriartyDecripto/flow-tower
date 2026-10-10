/**
 * Who talks when (#68 follow-up): the agent must not answer its own voice. Laptop speakers leak into the
 * mic and a clip is transcribed ~1 s after it ends, so every decision about a clip uses the time it was
 * RECORDED, compared with when replies were playing, never the time its transcript comes back.
 * Pure (no app imports): unit-tested in tests/voice-duplex.test.ts.
 */
/** After a reply stops, the room still rings and the recorder lags a little: the tail counts as playback. */
export const TAIL_MS = 700;

/** When the speech in a clip started and when the clip was cut (performance.now()). */
export interface Recorded { from: number; to: number }

/**
 * Spans while a reply was active (synthesizing or playing: agent.ts isSpeaking), oldest first; the last
 * one is open (to = Infinity) while it is. One definition of "the agent is talking" for the caption,
 * Esc and this gate.
 */
const spans: { from: number; to: number }[] = [];

export function playbackOn(at = performance.now()) {
  if (spans.at(-1)?.to !== Infinity) spans.push({ from: at, to: Infinity });
  while (spans.length > 1 && spans[0].to + 60_000 < at) spans.shift(); // a minute of history is plenty
}

export function playbackOff(at = performance.now()) {
  const last = spans.at(-1);
  if (last?.to === Infinity) last.to = at;
}

/** Was a reply active at any moment of this recording, or within `tail` ms after it ended? */
export const playedDuring = (at: Recorded, tail = TAIL_MS) => spans.some((s) => s.from <= at.to && s.to + tail >= at.from);

/**
 * Half-duplex unless the user turned on "Interrupt by voice": a clip recorded while a reply played is
 * dropped before it is transcribed (no cost, no loop). With headphones, barge-in may keep it.
 */
export const keepClip = (at: Recorded, bargeIn: boolean) => bargeIn || !playedDuring(at);

/** A transcript recorded over our own reply that repeats most of its words: the echo canceller missed it. */
export function isEcho(transcript: string, said: string, at: Recorded) {
  if (!playedDuring(at)) return false;
  const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
  const heard = words(transcript);
  const spoken = words(said);
  if (!heard.size) return false;
  return [...heard].filter((w) => spoken.has(w)).length / heard.size >= 0.6;
}

/** Barge-in by voice: real words cut the reply; a cough or "ok" while it talks does not (Pipecat: 3+ words). */
export function bargeIn(transcript: string): 'stop' | 'interrupt' | 'ignore' {
  if (/^(stop|basta|ferma|fermati|zitto|silenzio|enough|quiet|shut up)\b/i.test(transcript.trim())) return 'stop';
  return transcript.trim().split(/\s+/).length >= 3 ? 'interrupt' : 'ignore';
}

/** Tests only: forget the playback history. */
export const resetPlayback = () => { spans.length = 0; };
