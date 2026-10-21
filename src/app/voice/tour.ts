import type { ResolvedTower } from '../../core/types';
import { useStore } from '../store';
import { type Narration, narrateLayer, parts } from './narrate';

/**
 * The guided tour driver (#275): the tower on screen is walked layer by layer. Each layer is focused, its
 * intro is said, then one sentence per node while that node is lit, then the next layer. The outside
 * effects (speech, the mic, the narration model) come in through TourDeps, so this file imports nothing
 * from voice.ts: voice.ts → actions.ts → tour.ts would otherwise be an import cycle.
 */
export interface TourDeps {
  narrate: typeof narrateLayer;
  say(sentence: string, onPlay?: () => void): void;
  drained(): Promise<void>;
  /** Resets the echo filter's text; nothing is playing when it is called. */
  newReply(): void;
  stopSpeaking(): void;
  /** Settings > Voice > Spoken replies. */
  spoken(): boolean;
  /** The voice caption's "did" line. */
  caption(text: string): void;
  /** Re-arms the 2-minute idle stop of the mic, so a long tour does not turn it off. */
  keepAlive(): void;
  /** The user is speaking or a clip is being transcribed. */
  busy(): boolean;
}
export type TourOp = 'next' | 'previous' | 'details' | 'stop';

interface Tour {
  tower: ResolvedTower;
  said: string;
  deps: TourDeps;
  /** One controller per loop: a control jump aborts the loop and starts a new one. */
  ctl: AbortController;
  /**
   * Lives as long as the tour. A control jump must not cancel a summary: the next visit to that layer reuses
   * it. Only stopTour() and the end of the tour abort it.
   */
  life: AbortController;
  /** Ends the tour when the user leaves its tower or opens the library. */
  unsub?: () => void;
  /** The layer being walked now, as the controls see it. */
  at: number;
  /**
   * The summary narration of each layer, kept for the tour's life: going back to a layer, or a details
   * retelling that moves on to the next one, must not ask the model again. Details parts are not cached.
   */
  narrations: Map<number, Promise<Narration & { cost?: number; fallback?: boolean }>>;
}

let tour: Tour | undefined;

/** The tower on screen: the top of the stack. Undefined in the library with nothing behind it. */
const onScreen = (): ResolvedTower | undefined => {
  const s = useStore.getState();
  if (!s.workspace || !s.stack.length) return undefined;
  return s.workspace.towers[s.stack[s.stack.length - 1]] as ResolvedTower | undefined;
};

const abortError = () => new DOMException('The tour was stopped', 'AbortError');

/**
 * Rejects as soon as the tour is stopped or jumped, so no wait outlives its loop. drained() and timers
 * would otherwise keep a stopped tour talking or moving the view.
 */
function until<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(abortError());
    signal.addEventListener('abort', stop, { once: true });
    work.then(
      (v) => { signal.removeEventListener('abort', stop); resolve(v); },
      (e) => { signal.removeEventListener('abort', stop); reject(e); },
    );
  });
}

/** A pause that ends early when the tour stops; the timer is cleared so nothing fires late. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return until(new Promise<void>((r) => { timer = setTimeout(r, ms); }), signal)
    .finally(() => clearTimeout(timer));
}

/** Captions-only reading time: at least 2 s, and about 15 characters a second for longer sentences. */
const readTime = (sentence: string) => Math.max(2000, (sentence.length / 15) * 1000);

/**
 * The summary narration of a layer, asked once and then reused. A failed ask is dropped from the cache so a
 * later visit asks again; an abort is kept, since the tour is over then. The catch also keeps a summary nobody
 * awaits (a stopped tour) from becoming an unhandled rejection.
 */
function summary(t: Tour, index: number) {
  const cached = t.narrations.get(index);
  if (cached) return cached;
  const p = Promise.resolve(t.deps.narrate(t.tower, index, { said: t.said }, t.life.signal));
  t.narrations.set(index, p);
  p.catch((err) => {
    if (t.narrations.get(index) === p && (err as Error).name !== 'AbortError') t.narrations.delete(index);
  });
  return p;
}

/**
 * Says one layer's narration (or one part of a details retelling). Spoken: the sentences are queued and
 * the loop waits for the queue to drain, each line lighting its node as it plays. Captions only: the same
 * sentences one at a time, each for its reading time. Then a short pause, the moment the mic can hear a
 * command again (half-duplex ignores it while a reply plays).
 */
async function speakLayer(t: Tour, at: string, nar: Narration, signal: AbortSignal, withIntro: boolean) {
  const { deps } = t;
  if (deps.spoken()) {
    if (withIntro && nar.intro) deps.say(nar.intro);
    for (const line of nar.lines) {
      deps.say(line.sentence, () => {
        useStore.getState().hover(line.key);
        deps.caption(`${at} · ${line.sentence}`);
      });
    }
    // The rest groups the nodes without a line: nothing of them is lit, so the hover is cleared as it plays.
    if (nar.rest) deps.say(nar.rest, () => useStore.getState().hover(undefined));
    await until(deps.drained(), signal);
  } else {
    if (withIntro && nar.intro) {
      useStore.getState().hover(undefined);
      deps.caption(`${at} · ${nar.intro}`);
      await pause(readTime(nar.intro), signal);
    }
    for (const line of nar.lines) {
      useStore.getState().hover(line.key);
      deps.caption(`${at} · ${line.sentence}`);
      await pause(readTime(line.sentence), signal);
    }
    if (nar.rest) {
      useStore.getState().hover(undefined);
      deps.caption(`${at} · ${nar.rest}`);
      await pause(readTime(nar.rest), signal);
    }
  }
  useStore.getState().hover(undefined);
  await pause(1500, signal);
  // The user may be talking now: the mic is only useful again once they stop, but never wait for ever.
  if (deps.busy()) {
    let waited = 0;
    while (deps.busy() && waited < 8000) { await pause(250, signal); waited += 250; }
  }
}

/**
 * Walks the tower from `from`. In details mode the first layer is retold part by part; every other layer
 * is narrated once, with the next one asked for in the background. Resolves when the last layer is done.
 */
async function walk(t: Tour, from: number, details: boolean, signal: AbortSignal) {
  const { tower, deps } = t;
  const n = tower.layers.length;
  for (let i = from; i < n; i++) {
    t.at = i;
    deps.keepAlive();
    useStore.getState().focusLayer(i);
    const at = `Layer ${i + 1} of ${n}`;
    deps.caption(`${at} · ${tower.layers[i].title}`);
    // The current layer is asked before the next one, so the model answers this layer first. The wait races
    // the loop signal: the summary itself lives as long as the tour, so a jump does not cancel it.
    const current = details && i === from ? undefined : summary(t, i);
    if (i + 1 < n) summary(t, i + 1);
    // newReply() once, before the layer's first sentence: the echo filter compares with this reply only.
    deps.newReply();
    if (current) {
      await speakLayer(t, at, await until(current, signal), signal, true);
    } else {
      for (let part = 0; part < parts(tower, i); part++) {
        const nar = await deps.narrate(tower, i, { said: t.said, details: true, part }, signal);
        await speakLayer(t, at, nar, signal, part === 0);
      }
    }
  }
}

/**
 * Ends the tour's bookkeeping: it is no longer the running tour, the store listener is dropped, and the
 * summaries still being asked are cancelled. Shared by a normal end, a failure and stopTour().
 */
function release(t: Tour) {
  if (tour === t) tour = undefined;
  t.unsub?.();
  t.unsub = undefined;
  t.life.abort();
}

/** One loop: walks the tower, and ends the tour when it finishes or fails. A stopped loop ends silently. */
async function run(t: Tour, from: number, details: boolean) {
  const signal = t.ctl.signal;
  try {
    await walk(t, from, details, signal);
    if (signal.aborted) return;
    useStore.getState().hover(undefined);
    t.deps.caption('Tour finished');
    release(t);
  } catch (err) {
    if (signal.aborted || (err as Error).name === 'AbortError') return;
    release(t);
    useStore.getState().hover(undefined);
    t.deps.caption(`Tour stopped: ${(err as Error).message}`);
  }
}

/**
 * A control jump: the current loop is cancelled, its speech stopped, and a new loop starts at `from`. The
 * summaries stay cached, so a layer already told is not asked again. The hover is cleared here because the
 * node lit by the old loop would otherwise stay lit until the new layer's first line.
 */
function restart(t: Tour, from: number, details: boolean) {
  t.ctl.abort();
  t.deps.stopSpeaking();
  useStore.getState().hover(undefined);
  t.ctl = new AbortController();
  void run(t, from, details);
}

/** Starts the tour of the tower on screen; the loop runs in the background, the caption is returned. */
export function startTour(said: string, deps: TourDeps): string {
  const tower = onScreen();
  if (!tower) return 'No tower on screen';
  stopTour();
  const s = useStore.getState();
  if (s.library) s.showLibrary(false);
  s.select(undefined);
  const t: Tour = { tower, said, deps, ctl: new AbortController(), life: new AbortController(), at: 0, narrations: new Map() };
  tour = t;
  // Subscribed after the library and selection changes above, which are the tour's own. Any later change of
  // the stack (another project, a sub-tower, going up) or opening the library means the tour's layer numbers
  // no longer match the screen.
  t.unsub = useStore.subscribe((s, prev) => {
    if (tour !== t) return;
    if (s.stack === prev.stack && !(s.library && !prev.library)) return;
    stopTour();
    deps.caption('Tour stopped');
  });
  void run(t, 0, false);
  return `Guided tour · ${tower.name} · ${tower.layers.length} layers`;
}

/** The voice controls: next and previous jump, details retells the layer, stop ends the tour. */
export function tourControl(op: TourOp): string {
  const t = tour;
  if (!t) return 'No tour running';
  const i = t.at;
  const last = t.tower.layers.length - 1;
  switch (op) {
    case 'next':
      if (i >= last) { stopTour(); t.deps.caption('Tour finished'); return 'Tour finished'; }
      restart(t, i + 1, false);
      return 'Next layer';
    case 'previous':
      restart(t, Math.max(0, i - 1), false);
      return 'Previous layer';
    case 'details':
      restart(t, i, true);
      return `Layer ${i + 1} in detail`;
    case 'stop':
      stopTour();
      t.deps.caption('Tour stopped');
      return 'Tour stopped';
  }
}

export const isTouring = () => tour !== undefined;

/** Ends the tour quietly: mic off, Esc, or another command. Speech stops and the highlight clears. */
export function stopTour() {
  const t = tour;
  if (!t) return;
  release(t);
  t.ctl.abort();
  t.deps.stopSpeaking();
  useStore.getState().hover(undefined);
}
