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
 * Spans, oldest first; the last one is open (to = Infinity) while it lasts.
 * - active: a reply is synthesizing or playing (agent.ts isSpeaking). One definition of "the agent is
 *   talking" for the caption, Esc and the half-duplex gate.
 * - audible: a sentence is actually coming out of the speakers. Only a clip over it is an echo risk, and
 *   only it needs the barge-in rule (3+ words or a stop word).
 */
export type Span = 'active' | 'audible';
const spans: Record<Span, { from: number; to: number }[]> = { active: [], audible: [] };

export function playbackOn(at = performance.now(), kind: Span = 'active') {
  const list = spans[kind];
  if (list.at(-1)?.to !== Infinity) list.push({ from: at, to: Infinity });
  while (list.length > 1 && list[0].to + 60_000 < at) list.shift(); // a minute of history is plenty
}

/** Closes the open span of `kind`, or of both kinds. */
export function playbackOff(at = performance.now(), kind?: Span) {
  for (const k of kind ? [kind] : (['active', 'audible'] as const)) {
    const last = spans[k].at(-1);
    if (last?.to === Infinity) last.to = at;
  }
}

/** Was a reply active (or audible) at any moment of this recording, or within `tail` ms after it ended? */
export const playedDuring = (at: Recorded, tail = TAIL_MS, kind: Span = 'active') =>
  spans[kind].some((s) => s.from <= at.to && s.to + tail >= at.from);

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
export const resetPlayback = () => { spans.active.length = 0; spans.audible.length = 0; };
