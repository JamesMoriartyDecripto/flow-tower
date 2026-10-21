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
  /** The layer being walked now, as the controls see it. */
  at: number;
  /** The next layer's narration, asked while the current layer still plays. */
  prefetch?: { index: number; p: Promise<Narration & { cost?: number; fallback?: boolean }> };
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

/** Asks for a layer's narration. A prefetch nobody awaits (a stopped tour) must not be an unhandled rejection. */
function ask(t: Tour, index: number, signal: AbortSignal) {
  const p = Promise.resolve(t.deps.narrate(t.tower, index, { said: t.said }, signal));
  p.catch(() => undefined);
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
    // Taken before the next prefetch replaces it; a prefetch for this layer was asked during the last one.
    const ready = t.prefetch?.index === i ? t.prefetch.p : undefined;
    t.prefetch = undefined;
    // The current layer is asked before the next one, so the model answers this layer first.
    const current = details && i === from ? undefined : (ready ?? ask(t, i, signal));
    if (i + 1 < n) t.prefetch = { index: i + 1, p: ask(t, i + 1, signal) };
    // newReply() once, before the layer's first sentence: the echo filter compares with this reply only.
    deps.newReply();
    if (current) {
      await speakLayer(t, at, await current, signal, true);
    } else {
      for (let part = 0; part < parts(tower, i); part++) {
        const nar = await deps.narrate(tower, i, { said: t.said, details: true, part }, signal);
        await speakLayer(t, at, nar, signal, part === 0);
      }
    }
  }
}

/** One loop: walks the tower, and ends the tour when it finishes or fails. A stopped loop ends silently. */
async function run(t: Tour, from: number, details: boolean) {
  const signal = t.ctl.signal;
  try {
    await walk(t, from, details, signal);
    if (signal.aborted) return;
    useStore.getState().hover(undefined);
    t.deps.caption('Tour finished');
    if (tour === t) tour = undefined;
  } catch (err) {
    if (signal.aborted || (err as Error).name === 'AbortError') return;
    if (tour === t) tour = undefined;
    useStore.getState().hover(undefined);
    t.deps.caption(`Tour stopped: ${(err as Error).message}`);
  }
}

/** A control jump: the current loop is cancelled, its speech stopped, and a new loop starts at `from`. */
function restart(t: Tour, from: number, details: boolean) {
  t.ctl.abort();
  t.deps.stopSpeaking();
  t.ctl = new AbortController();
  t.prefetch = undefined;
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
  const t: Tour = { tower, said, deps, ctl: new AbortController(), at: 0 };
  tour = t;
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
  tour = undefined;
  t.ctl.abort();
  t.deps.stopSpeaking();
  useStore.getState().hover(undefined);
}
