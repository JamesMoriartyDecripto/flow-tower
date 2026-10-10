import { create } from 'zustand';
import { towerPath } from '../graph';
import { chooseView, usePrefs } from '../settings';
import { findNode, useStore } from '../store';
import { norm, parseCommand, type VoiceAction } from './commands';
import { openMic, type Mic } from './mic';
import { ack, ackDelay, ackLanguage, firstAnswerAudio, firstAudio, warmAck, converse, forget, isEcho, isSpeaking, newReply, onPlaybackBlocked, say, stopSpeaking, wantsAgent } from './agent';
import { clearAgentSearch } from './tools';
import { bargeIn, keepClip, playedDuring, type Recorded } from './duplex';
import { isHallucination } from './noise';
import { applyAliases, interrupted, judgeLast, loadMemory, notesForAgent, record, reviewIfDue } from './journal';

export type VoiceStatus = 'off' | 'starting' | 'listening' | 'hearing' | 'thinking';

interface VoiceState {
  status: VoiceStatus;
  /** The server has OPENROUTER_API_KEY (GET /api/voice). */
  cloud?: boolean;
  /** The server has an agent model: questions and unknown commands get a spoken answer (#63). */
  agent?: boolean;
  heard?: string;
  did?: string;
  error?: string;
  /** Suggestions from the journal review waiting in Settings > Voice (#68). */
  suggestions?: number;
  /** A command that named several things: the next "one" / "two" / "il primo" picks. */
  options?: { label: string; action: VoiceAction }[];
  toggle(): void;
  run(text: string): string;
  /** Handles a transcript as if it had been heard: parser or agent, caption and voice (tests, dev hook). */
  hear(text: string): Promise<void>;
  dismiss(): void;
  /** Stops the reply being spoken (Esc), without turning the mic off. False when nothing was playing. */
  hush(): boolean;
}

/** Proves a request comes from this page: src/server/voice.ts refuses POSTs without it. */
const VOICE_HEADER = 'x-flow-tower-voice';
/** Listening stops by itself after this long without an understood command (privacy, battery). */
const IDLE_OFF_MS = 120_000;
const NOT_UNDERSTOOD = 'Not understood';
const PICK: Record<string, number> = {
  primo: 0, prima: 0, uno: 0, first: 0, one: 0, secondo: 1, seconda: 1, due: 1, second: 1, two: 1,
  terzo: 2, terza: 2, tre: 2, third: 2, three: 2, quarto: 3, quarta: 3, quattro: 3, fourth: 3, four: 3,
};
const FILLER = new Set(['il', 'la', 'l', 'lo', 'the', 'quello', 'quella', 'that', 'number', 'numero']);

let mic: Mic | undefined;
/** Bumped by every start and stop: a start or a transcription that outlives its session drops its result. */
let session = 0;
let queue = Promise.resolve();
let pending = 0;
let speaking = false;
let idle: ReturnType<typeof setTimeout> | undefined;
let hideError: ReturnType<typeof setTimeout> | undefined;
/** The agent turn in flight: hush() mutes the rest of its reply, and it is recorded as interrupted. */
let turnNow: { muted: boolean; spoke: boolean } | undefined;
/** The "wait after the reply" hint is shown once per listening session. */
let tailHinted = false;
/** Cancels the agent turn in flight: stopping the mic stops its tools from moving the view. */
let turnAbort = new AbortController();
/** The "one moment" timer for an agent turn that has nothing to say yet (#70). */
let ackTimer: ReturnType<typeof setTimeout> | undefined;

/** "il secondo", "two", "3": a short answer that is only a pick. "livello tre" is a command, not a pick. */
function pickOf(text: string): number | undefined {
  const words = norm(text).split(' ').filter((w) => w && !FILLER.has(w));
  if (words.length !== 1) return undefined;
  return PICK[words[0]] ?? (/^[1-4]$/.test(words[0]) ? Number(words[0]) - 1 : undefined);
}

export const useVoice = create<VoiceState>((set, get) => ({
  status: 'off',
  toggle() {
    if (get().status !== 'off') return stop();
    void start();
  },
  run(text) {
    const s = useStore.getState();
    const ws = s.workspace;
    if (!ws) return '';
    const options = get().options;
    const pick = options && pickOf(text);
    const action = pick !== undefined && options![pick] ? options![pick].action : parseCommand(text, {
      ws, tower: ws.towers[s.stack[s.stack.length - 1]], library: s.library,
    });
    const did = execute(action);
    set({ heard: text, did, options: action.kind === 'ambiguous' ? action.options : undefined, error: undefined });
    return did;
  },
  hear: (text) => handle(text, session),
  dismiss() {
    clearTimeout(hideError);
    set({ error: undefined, ...(get().status === 'off' && { suggestions: undefined }) });
  },
  hush() {
    const t = turnNow;
    if (!isSpeaking() && !(t?.spoke && !t.muted)) return false;
    stopSpeaking();
    // The turn still streaming: say nothing more of it, stop its stream (no later tool call may move the
    // view after Esc), and record it as interrupted. A turn already recorded (its reply still playing) is
    // marked instead.
    if (t) { t.muted = true; turnAbort.abort(); } else interrupted();
    return true;
  },
}));

// A pending choice belongs to what was on screen when it was offered: moving anywhere else drops it.
useStore.subscribe((s, prev) => {
  if (s.stack === prev.stack && s.selected === prev.selected && s.focusedLayer === prev.focusedLayer && s.library === prev.library) return;
  if (useVoice.getState().options) useVoice.setState({ options: undefined });
});

// Autoplay blocked: the reply is still on the caption, and the user learns why it is silent.
onPlaybackBlocked((message) => flash(message));

const status = (): VoiceStatus => (speaking ? 'hearing' : pending ? 'thinking' : 'listening');

/** An error while listening: shown, then faded, without stopping the mic. */
function flash(error: string) {
  clearTimeout(hideError);
  useVoice.setState({ error });
  hideError = setTimeout(() => useVoice.setState({ error: undefined }), 8000);
}

/** A failure that ends listening (no key, no server, no mic): shown, then faded; the caption can close it too. */
function fail(error: string) {
  clearTimeout(hideError);
  useVoice.setState({ status: 'off', error });
  hideError = setTimeout(() => useVoice.setState({ error: undefined }), 8000);
}

async function start() {
  const set = useVoice.setState;
  const mine = ++session;
  // A fresh session: no count or queue left over from a stopped one (its fetch may still be in flight).
  pending = 0;
  queue = Promise.resolve();
  tailHinted = false;
  clearTimeout(hideError);
  set({ status: 'starting', error: undefined, did: undefined, heard: undefined });
  const config = await fetch('/api/voice').then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined) as { cloud: boolean; agent?: string } | undefined;
  if (mine !== session) return; // stopped while asking
  set({ cloud: config?.cloud, agent: !!config?.agent });
  // What the user accepted from past reviews: aliases for the parser, notes for the agent.
  void loadMemory().then((m) => m && set({ suggestions: m.memory.pending.length || undefined }));
  if (!config) return fail('Voice commands need the local flow-tower server, which this page cannot reach.');
  if (!config.cloud) return fail('Voice commands need OPENROUTER_API_KEY in ~/.config/flow-tower/.env (or the git-ignored .env in the flow-tower folder), then a restart.');
  try {
    const opened = await openMic({
      speaking: (on) => {
        // Half-duplex: our own reply in the speakers is not the user speaking.
        speaking = on && (usePrefs.getState().voiceBargeIn || !isSpeaking());
        if (mine === session) set({ status: status() });
      },
      clip: (audio, format, at) => {
        if (mine !== session) return; // the recorder's last clip can land just after a stop
        // Decided on when it was recorded, not when it would be transcribed: a clip recorded while the
        // reply played is the reply itself (laptop speakers), unless the user turned on interrupting by voice.
        if (!keepClip(at, usePrefs.getState().voiceBargeIn)) {
          // Started just after the reply ended (not during it): the user was quick, tell them why it was missed.
          if (!playedDuring(at, 0) && !tailHinted) { tailHinted = true; flash('Wait a moment after the reply, or press Esc to interrupt it.'); }
          return;
        }
        pending++;
        set({ status: status() });
        queue = queue.then(() => transcribe(audio, format, mine, at)).finally(() => {
          if (mine !== session) return;
          pending--;
          set({ status: status() });
        });
      },
      ended: () => {
        if (mine !== session) return;
        stop();
        fail('The microphone stopped (unplugged, or taken by another app).');
      },
    }, () => usePrefs.getState().voiceSensitivity);
    if (mine !== session) return opened.close(); // stopped while the permission prompt was open
    mic = opened;
    set({ status: 'listening' });
    // The acknowledgement is synthesized once, before it is ever needed: it must already be cached when
    // the first agent turn reaches ACK_DELAY_MS, not started then (#70). Only when replies are spoken.
    const prefs = usePrefs.getState();
    if (prefs.voiceReplies) warmAck(ackLanguage(undefined, prefs.voiceLanguage, navigator.language));
    armIdle();
  } catch (err) {
    if (mine === session) fail(`Microphone not available: ${(err as Error).message}`);
  }
}

function stop() {
  session++;
  turnAbort.abort();
  clearTimeout(ackTimer);
  stopSpeaking();
  forget(); // one listening session is one conversation
  clearAgentSearch();
  // Enough new turns in the journal: ask for suggestions now, decided later in Settings.
  void reviewIfDue().then((n) => { if (n) useVoice.setState({ suggestions: n }); });
  mic?.close();
  mic = undefined;
  speaking = false;
  clearTimeout(idle);
  clearTimeout(hideError);
  useVoice.setState({ status: 'off', options: undefined, error: undefined });
}

function armIdle() {
  clearTimeout(idle);
  idle = setTimeout(stop, IDLE_OFF_MS);
}

async function transcribe(audio: Blob, format: string, mine: number, at: Recorded) {
  if (mine !== session) return;
  const language = usePrefs.getState().voiceLanguage;
  try {
    const r = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [VOICE_HEADER]: '1' },
      // The language set in Settings (Voice), or none: the browser's UI language is not the speaker's, and Whisper
      // detects it from the clip. A hint helps short commands.
      body: JSON.stringify({ audio: await base64(audio), format, ...(language !== 'auto' && { language }) }),
    });
    const out = (await r.json()) as { text?: string; error?: string; ms?: number; cost?: number; language?: string };
    if (mine !== session) return; // stopped while transcribing: the command no longer applies
    if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
    const text = out.text?.trim();
    // Our own reply caught by the mic, or what Whisper writes for noise ("Grazie.", "Thank you."): dropped
    // before anything handles or journals it.
    if (!text || isEcho(text, at) || isHallucination(text)) return;
    if (playedDuring(at, 0, 'audible')) {
      // Barge-in (only with "Interrupt by voice" on), for clips over the reply actually coming out of the
      // speakers (not its tail, not the silent wait for synthesis): real words stop it; a cough or "ok" does not.
      const kind = bargeIn(text);
      if (kind === 'ignore') return;
      if (isSpeaking()) { stopSpeaking(); interrupted(); }
      if (kind === 'stop') return;
    }
    // What this stage took and cost, the language, and when the speech ended: journaled with the turn,
    // and the end of speech is what the acknowledgement timer counts from (#70).
    await handle(text, mine, { sttMs: out.ms, sttCost: out.cost, language: out.language }, at.to);
  } catch (err) {
    if (mine === session) flash((err as Error).message);
  }
}

/**
 * Questions go to the agent; navigation the parser understands stays instant, and what it does not
 * understand goes to the agent too. Whisper writes something even for noise ("Grazie.", "Thank you."):
 * those name nothing, and only an understood command or an answer keeps the mic alive.
 */
/** What the journal keeps of a transcription (all optional: hear() passes none). */
interface Heard { sttMs?: number; sttCost?: number; language?: string }

async function handle(heard: string, mine: number, stt: Heard = {}, endOfSpeech?: number) {
  const heardAt = performance.now();
  judgeLast(heard); // "no, the other one" or "back" right after: the last turn was wrong
  // Aliases the user accepted from past reviews ("triaje" → "triage") apply before anything reads it.
  const text = applyAliases(heard);
  const s = useStore.getState();
  const tower = s.library ? undefined : s.stack[s.stack.length - 1];
  // Where the user was when they spoke (before the command moves anything): for the journal and its review.
  const layer = tower && s.focusedLayer !== undefined ? s.workspace?.towers[tower]?.layers[s.focusedLayer]?.id : undefined;
  const pref = usePrefs.getState().voiceLanguage;
  const lang = stt.language ?? (pref !== 'auto' ? pref : undefined);
  const context = {
    heard, tower, ...stt, language: lang,
    ...(layer && { layer }), ...(tower && s.selected && { node: s.selected }),
  };
  const { agent, options } = useVoice.getState();
  // A numbered choice is waiting: "il primo" / "the second" answer it, not the agent.
  const picking = !!options && pickOf(text) !== undefined;
  if (!agent || picking || !wantsAgent(text)) {
    const did = useVoice.getState().run(text);
    if (did !== NOT_UNDERSTOOD || !agent) record({ ...context, route: picking ? 'pick' : 'parser', did, outcome: did === NOT_UNDERSTOOD ? 'not_understood' : 'done' });
    if (did !== NOT_UNDERSTOOD) return armIdle();
    if (!agent) return;
  }
  useVoice.setState({ heard: text, did: 'Thinking…', options: undefined });
  newReply();
  clearAgentSearch();
  turnAbort = new AbortController();
  const voice = usePrefs.getState().voiceReplies;
  const t = { muted: false, spoke: false };
  turnNow = t;
  // The cached "one moment" (#70): synthesized now that the turn's language is known, and armed to play
  // ACK_DELAY_MS after the END OF SPEECH (the transcription must not eat into the silence gap). Only
  // agent turns with spoken replies: with them off nothing is synthesized at all.
  let acked = false;
  clearTimeout(ackTimer);
  ackTimer = undefined;
  if (voice) {
    const ackLang = ackLanguage(stt.language, usePrefs.getState().voiceLanguage, navigator.language);
    warmAck(ackLang);
    if (ackLang) {
      ackTimer = setTimeout(() => {
        ackTimer = undefined;
        // Nothing spoken yet, not hushed, not muted, still the current turn: fill the silence once.
        // acked only when the sound starts: a turn stopped before that is not marked as having one.
        if (mine === session && turnNow === t && !t.muted && !t.spoke && !turnAbort.signal.aborted) ack(ackLang, () => { acked = true; });
      }, ackDelay(endOfSpeech, performance.now()));
    }
  }
  const live = (did: string) => { if (mine === session) useVoice.setState({ did }); };
  // Streamed: the caption shows each tool step and then the reply as it is written; each finished
  // sentence is spoken while the next one is still being generated.
  let turn;
  try {
    turn = await converse(text, {
      step: live,
      text: live,
      sentence: (s) => { if (voice && mine === session && !t.muted) { clearTimeout(ackTimer); ackTimer = undefined; t.spoke = true; say(s); } },
    }, turnAbort.signal, notesForAgent());
  } catch (err) {
    clearTimeout(ackTimer);
    if (turnNow === t) turnNow = undefined;
    if (t.muted && mine === session) { // Esc while it was still being written
      useVoice.setState({ did: 'Stopped' });
      record({ ...context, route: 'agent', did: 'stopped (Esc)', outcome: 'interrupted' });
      return;
    }
    if (mine === session) {
      useVoice.setState({ did: `No answer: ${(err as Error).message}` });
      record({ ...context, route: 'agent', did: (err as Error).message, outcome: 'error' });
    }
    return;
  }
  if (mine !== session) { if (turnNow === t) turnNow = undefined; clearTimeout(ackTimer); return; }
  useVoice.setState({ did: turn.reply });
  armIdle();
  // Time to first audio: what the user waits in silence (the ack counts, and it is the number the
  // caption's "first audio" has always meant). The last sentence may still be on its way to the speech
  // model, so the entry waits for it (the next transcript waits in the queue anyway).
  const audioAt = voice && !t.muted ? await firstAudio() : undefined;
  // Time to the first real sentence: what the LLM and the synthesis took, the ack excluded (#70).
  const answerAt = voice && !t.muted && t.spoke ? await firstAnswerAudio() : undefined;
  if (turnNow === t) turnNow = undefined;
  clearTimeout(ackTimer);
  record({
    ...context, route: 'agent', did: turn.reply, outcome: t.muted ? 'interrupted' : 'done', tools: turn.tools, ms: turn.ms, cost: turn.cost,
    ...(audioAt !== undefined && { firstAudioMs: Math.round(audioAt - heardAt) }),
    ...(answerAt !== undefined && { firstAnswerMs: Math.round(answerAt - heardAt) }),
    ...(acked ? { ack: true } : {}),
  });
}

const base64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** Applies an action with the same store calls as the keyboard; returns what it did, for the widget. */
function execute(a: VoiceAction): string {
  const s = useStore.getState();
  const ws = s.workspace!;
  const tower = ws.towers[s.stack[s.stack.length - 1]];
  switch (a.kind) {
    case 'library': s.showLibrary(true); return 'Library';
    case 'tower': {
      const path = towerPath(ws, a.id);
      if (!path) return `${ws.towers[a.id].name} is not reachable from the library`;
      s.openPath(path);
      return ws.towers[a.id].name;
    }
    case 'layer': {
      const layer = tower?.layers[a.index];
      if (!layer) return NOT_UNDERSTOOD;
      if (s.library) s.showLibrary(false);
      s.select(undefined);
      s.focusLayer(a.index);
      return `L${String(a.index + 1).padStart(2, '0')} ${layer.title}`;
    }
    case 'node': {
      const t = ws.towers[a.tower];
      const layer = t?.layers.findIndex((l) => l.nodes.some((n) => n.key === a.key)) ?? -1;
      if (layer < 0) return NOT_UNDERSTOOD;
      if (s.library) s.showLibrary(false);
      if (a.tower !== tower?.id) {
        const path = towerPath(ws, a.tower);
        if (!path) return `${t.name} is not reachable from the library`;
        s.openPath(path, a.key);
      } else s.select(a.key);
      useStore.getState().focusLayer(layer);
      return `${findNode(t, a.key)?.label} · ${t.layers[layer].title}`;
    }
    case 'view': chooseView(a.view); return a.view === 'map' ? 'Map view' : 'Tower view';
    case 'overview':
      if (s.library) s.showLibrary(false);
      s.select(undefined);
      s.resetView();
      return 'Overview';
    case 'back':
      if (s.library && s.stack.length) s.showLibrary(false);
      else if (s.file) s.openFile(undefined);
      else if (s.selected) s.select(undefined);
      else if (s.focusedLayer !== undefined) s.resetView();
      else if (s.stack.length > 1) s.goTo(s.stack.length - 2);
      else s.showLibrary(true);
      return 'Back';
    case 'enter': {
      const node = findNode(tower, s.selected);
      if (!node?.tower) return 'No sub-tower here';
      if (s.library) s.showLibrary(false);
      s.enterTower(node.tower);
      return ws.towers[node.tower]?.name ?? 'Sub-tower';
    }
    case 'close': s.openFile(undefined); s.select(undefined); return 'Closed';
    case 'mic-off': setTimeout(stop); return 'Microphone off';
    case 'ambiguous': return `Which one? ${a.options.map((o, i) => `${i + 1}. ${o.label}`).join('  ')}`;
    case 'unknown': return NOT_UNDERSTOOD;
  }
}
