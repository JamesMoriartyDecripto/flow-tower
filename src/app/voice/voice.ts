import { create } from 'zustand';
import { towerPath } from '../graph';
import { chooseView, usePrefs } from '../settings';
import { findNode, useStore } from '../store';
import { norm, parseCommand, type VoiceAction } from './commands';
import { openMic, type Mic } from './mic';
import { converse, forget, isEcho, isSpeaking, newReply, say, stopSpeaking, wantsAgent } from './agent';
import { clearAgentSearch } from './tools';

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
  /** A command that named several things: the next "one" / "two" / "il primo" picks. */
  options?: { label: string; action: VoiceAction }[];
  toggle(): void;
  run(text: string): string;
  /** Handles a transcript as if it had been heard: parser or agent, caption and voice (tests, dev hook). */
  hear(text: string): Promise<void>;
  dismiss(): void;
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
/** Cancels the agent turn in flight: stopping the mic stops its tools from moving the view. */
let turnAbort = new AbortController();

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
    set({ error: undefined });
  },
}));

// A pending choice belongs to what was on screen when it was offered: moving anywhere else drops it.
useStore.subscribe((s, prev) => {
  if (s.stack === prev.stack && s.selected === prev.selected && s.focusedLayer === prev.focusedLayer && s.library === prev.library) return;
  if (useVoice.getState().options) useVoice.setState({ options: undefined });
});

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
  clearTimeout(hideError);
  set({ status: 'starting', error: undefined, did: undefined, heard: undefined });
  const config = await fetch('/api/voice').then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined) as { cloud: boolean; agent?: string } | undefined;
  if (mine !== session) return; // stopped while asking
  set({ cloud: config?.cloud, agent: !!config?.agent });
  if (!config) return fail('Voice commands need the local flow-tower server, which this page cannot reach.');
  if (!config.cloud) return fail('Voice commands need OPENROUTER_API_KEY in flow-tower/.env (git-ignored), then a restart.');
  try {
    const opened = await openMic({
      speaking: (on) => {
        speaking = on;
        if (mine === session) set({ status: status() });
      },
      clip: (audio, format) => {
        if (mine !== session) return; // the recorder's last clip can land just after a stop
        pending++;
        set({ status: status() });
        queue = queue.then(() => transcribe(audio, format, mine)).finally(() => {
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
    });
    if (mine !== session) return opened.close(); // stopped while the permission prompt was open
    mic = opened;
    set({ status: 'listening' });
    armIdle();
  } catch (err) {
    if (mine === session) fail(`Microphone not available: ${(err as Error).message}`);
  }
}

function stop() {
  session++;
  turnAbort.abort();
  stopSpeaking();
  forget(); // one listening session is one conversation
  clearAgentSearch();
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

async function transcribe(audio: Blob, format: string, mine: number) {
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
    const out = (await r.json()) as { text?: string; error?: string };
    if (mine !== session) return; // stopped while transcribing: the command no longer applies
    if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
    const text = out.text?.trim();
    if (!text || isEcho(text)) return; // our own reply, caught by the mic
    if (isSpeaking()) {
      // Barge-in: real words stop the reply; a cough or "ok" while it talks does not (Pipecat: 3+ words).
      const stopWord = /^(stop|basta|ferma|fermati|zitto|silenzio|enough|quiet|shut up)\b/i.test(text);
      if (!stopWord && text.split(/\s+/).length < 3) return;
      stopSpeaking();
      if (stopWord) return;
    }
    await handle(text, mine);
  } catch (err) {
    if (mine === session) flash((err as Error).message);
  }
}

/**
 * Questions go to the agent; navigation the parser understands stays instant, and what it does not
 * understand goes to the agent too. Whisper writes something even for noise ("Grazie.", "Thank you."):
 * those name nothing, and only an understood command or an answer keeps the mic alive.
 */
async function handle(text: string, mine: number) {
  const { agent, options } = useVoice.getState();
  // A numbered choice is waiting: "il primo" / "the second" answer it, not the agent.
  const picking = !!options && pickOf(text) !== undefined;
  if (!agent || picking || !wantsAgent(text)) {
    if (useVoice.getState().run(text) !== NOT_UNDERSTOOD) return armIdle();
    if (!agent) return;
  }
  useVoice.setState({ heard: text, did: 'Thinking…', options: undefined });
  newReply();
  clearAgentSearch();
  turnAbort = new AbortController();
  const voice = usePrefs.getState().voiceReplies;
  const live = (did: string) => { if (mine === session) useVoice.setState({ did }); };
  // Streamed: the caption shows each tool step and then the reply as it is written; each finished
  // sentence is spoken while the next one is still being generated.
  let turn;
  try {
    turn = await converse(text, {
      step: live,
      text: live,
      sentence: (s) => { if (voice && mine === session) say(s); },
    }, turnAbort.signal);
  } catch (err) {
    if (mine === session) useVoice.setState({ did: `No answer: ${(err as Error).message}` });
    return;
  }
  if (mine !== session) return;
  useVoice.setState({ did: turn.reply });
  armIdle();
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
