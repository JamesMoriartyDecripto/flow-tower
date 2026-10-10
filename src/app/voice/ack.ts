import { enqueueReady, speak } from './agent';

/**
 * The short spoken acknowledgement (#70): the agent's first LLM step and the first synthesis take ~2 s,
 * so a tiny cached phrase fills the silence from the end of speech to the first real sentence. One per
 * turn (armAck() arms a single timer), and the language must be known (from the transcription, the
 * Settings hint, or the browser). Phrases are rotated instead of throttled: a follow-up question right
 * after the previous one is still answered, just with different words.
 */
const PHRASES: Record<string, string[]> = {
  it: ['Un attimo.', 'Vediamo.', 'Allora, guardo.'],
  en: ['One moment.', 'Let me see.', 'Let me check.'],
  es: ['Un momento.', 'Veamos.'],
  fr: ['Un instant.', 'Voyons.'],
  de: ['Einen Moment.', 'Mal sehen.'],
  pt: ['Um momento.', 'Vamos ver.'],
};

/** What a turn with nothing spoken yet waits, from the END OF SPEECH, before the ack plays. */
export const ACK_DELAY_MS = 600;
/**
 * Providers report languages in different shapes: Whisper gives ISO 639-1, some give 639-2/3 codes
 * ("ita", "eng") or full names ("italian"). All of them mean the same ack, so they are folded here.
 */
const ACK_ALIASES: Record<string, string> = {
  ita: 'it', italian: 'it', eng: 'en', english: 'en', spa: 'es', spanish: 'es',
  fra: 'fr', fre: 'fr', french: 'fr', deu: 'de', ger: 'de', german: 'de', por: 'pt', portuguese: 'pt',
};

/**
 * The language of an acknowledgement, or undefined when it has none: lowercase, the region dropped
 * ("it-IT" → "it"), the 639-2/3 codes and full names mapped, and only codes we have an ack for.
 */
export function ackCode(language?: string): string | undefined {
  const raw = language?.trim().toLowerCase();
  if (!raw) return undefined;
  const base = raw.split(/[-_]/)[0];
  const code = ACK_ALIASES[raw] ?? ACK_ALIASES[base] ?? base.slice(0, 2);
  return PHRASES[code] ? code : undefined;
}

/**
 * The language of this turn's ack: what the transcription detected, else the Settings hint, else the
 * browser's language ("auto" has no language of its own, and most users speak their browser's).
 */
export function ackLanguage(stt?: string, pref?: string, browser?: string): string | undefined {
  return ackCode(stt) ?? ackCode(pref && pref !== 'auto' ? pref : undefined) ?? ackCode(browser);
}

/**
 * How long from `now` until the ack, so it lands ACK_DELAY_MS after the END OF SPEECH: the transcription
 * takes 0.4–1.2 s, and arming the timer when handle() runs would play the ack 1–1.8 s too late.
 * A turn with no recorded clip (typed, hear() in tests) has no end of speech: the full delay.
 */
export const ackDelay = (endOfSpeech: number | undefined, now: number) =>
  endOfSpeech === undefined ? ACK_DELAY_MS : Math.max(0, ACK_DELAY_MS - (now - endOfSpeech));

/** Resolved blobs, keyed by phrase; a failed synthesis leaves no entry here. */
const ready = new Map<string, Blob>();
/** Synthesis in flight per phrase, so the warm-ups a single language makes never start it twice. */
const pending = new Map<string, Promise<Blob | undefined>>();
/** When a phrase's synthesis last failed: a down TTS is not hit again for FAILED_FOR_MS. */
const failedAt = new Map<string, number>();
/** A failed synthesis waits this long before the phrase is worth another /speak call. */
const FAILED_FOR_MS = 60_000;
/** Which phrase of a language plays next: the round-robin cursor, so repeats never feel canned. */
const cursor = new Map<string, number>();
/** The phrase that played last, so it never plays twice in a row while another is cached. */
let lastPlayed: string | undefined;
/**
 * Bumped by resetAck(): a synthesis in flight when the cache is cleared must not repopulate it, or a
 * test (and a fresh session) would see stale blobs appear after the reset.
 */
let generation = 0;

/** Starts synthesizing one phrase if it is not cached, not in flight, and not in its failure cooldown. */
function warmPhrase(phrase: string) {
  if (ready.has(phrase) || pending.has(phrase)) return;
  const failed = failedAt.get(phrase);
  if (failed !== undefined && performance.now() - failed < FAILED_FOR_MS) return;
  const gen = generation;
  const p = speak(phrase, new AbortController().signal);
  pending.set(phrase, p);
  void p.then((blob) => {
    if (gen !== generation) return; // resetAck(): the cache was cleared meanwhile, do not repopulate it
    pending.delete(phrase);
    if (blob) { ready.set(phrase, blob); failedAt.delete(phrase); }
    else failedAt.set(phrase, performance.now());
  });
}

/** Starts synthesizing every phrase of `language` if not cached yet (never waits for it). */
export function warmAck(language?: string) {
  const code = ackCode(language);
  if (!code) return;
  for (const phrase of PHRASES[code]) warmPhrase(phrase);
}

/** Tests only: forget the cached acknowledgements, the cooldowns and the rotation. */
export function resetAck() {
  generation++;
  ready.clear();
  pending.clear();
  failedAt.clear();
  cursor.clear();
  lastPlayed = undefined;
}

/**
 * Plays the next cached phrase for `language` through the reply player; false when nothing is cached.
 * Round-robin per language, and never the same phrase twice in a row while another is cached.
 * `onPlay` fires only once the sound actually starts, so a turn stopped before it played is not marked.
 */
export function ack(language?: string, onPlay?: () => void): boolean {
  const code = ackCode(language);
  if (!code) return false;
  const phrases = PHRASES[code];
  // Only phrases whose blob already resolved are spoken: a cold synthesis delays at most one turn.
  let pool = phrases.filter((p) => ready.has(p));
  if (pool.length > 1 && lastPlayed) pool = pool.filter((p) => p !== lastPlayed);
  if (!pool.length) return false;
  const start = cursor.get(code) ?? 0;
  for (let i = 0; i < phrases.length; i++) {
    const at = (start + i) % phrases.length;
    if (pool.includes(phrases[at])) {
      const phrase = phrases[at];
      cursor.set(code, (at + 1) % phrases.length);
      lastPlayed = phrase;
      enqueueReady(phrase, ready.get(phrase)!, onPlay);
      return true;
    }
  }
  return false;
}

export interface ArmAck {
  /** When the speech was recorded as ended, so the delay is measured from there, not from now. */
  endOfSpeech?: number;
  language?: string;
  /** Whether this turn is still the live one: a stopped, hushed or already speaking turn stays silent. */
  live: () => boolean;
  onPlay?: () => void;
}

/**
 * Arms the one ack of a turn: warms the language's phrases and, ACK_DELAY_MS after the end of speech,
 * plays the next cached one if the turn is still live. Returns a cancel function; a later arm or a stop
 * must call it, so a turn never has two timers.
 */
export function armAck({ endOfSpeech, language, live, onPlay }: ArmAck): () => void {
  const code = ackCode(language);
  if (!code) return () => {};
  warmAck(code);
  const id = setTimeout(() => { if (live()) ack(code, onPlay); }, ackDelay(endOfSpeech, performance.now()));
  return () => clearTimeout(id);
}
