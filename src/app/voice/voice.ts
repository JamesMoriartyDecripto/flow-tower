import { create } from 'zustand';
import { towerPath } from '../graph';
import { chooseView } from '../settings';
import { findNode, useStore } from '../store';
import { norm, parseCommand, type VoiceAction } from './commands';
import { openMic, type Mic } from './mic';

export type VoiceStatus = 'off' | 'starting' | 'listening' | 'hearing' | 'thinking';

interface VoiceState {
  status: VoiceStatus;
  /** The server has OPENROUTER_API_KEY (GET /api/voice). */
  cloud?: boolean;
  heard?: string;
  did?: string;
  error?: string;
  /** A command that named several things: the next "one" / "two" / "il primo" picks. */
  options?: { label: string; action: VoiceAction }[];
  toggle(): void;
  run(text: string): string;
}

let mic: Mic | undefined;
let queue = Promise.resolve();
let idle: ReturnType<typeof setTimeout> | undefined;
/** Listening stops by itself after this long without a command (privacy, battery). */
const IDLE_OFF_MS = 120_000;
const PICK: Record<string, number> = { primo: 0, prima: 0, uno: 0, first: 0, one: 0, secondo: 1, seconda: 1, due: 1, second: 1, two: 1, terzo: 2, terza: 2, tre: 2, third: 2, three: 2, quarto: 3, quattro: 3, fourth: 3, four: 3 };

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
    const pending = get().options;
    const pick = pending && norm(text).split(' ').map((w) => PICK[w]).find((i) => i !== undefined);
    const action = pick !== undefined && pending![pick] ? pending![pick].action : parseCommand(text, {
      ws, tower: ws.towers[s.stack[s.stack.length - 1]], library: s.library,
    });
    const did = execute(action);
    set({ heard: text, did, options: action.kind === 'ambiguous' ? action.options : undefined, error: undefined });
    return did;
  },
}));

async function start() {
  const set = useVoice.setState;
  set({ status: 'starting', error: undefined, did: undefined, heard: undefined });
  const config = await fetch('/api/voice').then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined) as { cloud: boolean } | undefined;
  set({ cloud: config?.cloud });
  if (!config?.cloud) {
    return set({ status: 'off', error: 'Voice commands need OPENROUTER_API_KEY in flow-tower/.env (git-ignored), then a restart.' });
  }
  try {
    mic = await openMic({
      speaking: (on) => set({ status: on ? 'hearing' : 'listening' }),
      clip: (audio, format) => { queue = queue.then(() => transcribe(audio, format)); },
    });
    set({ status: 'listening' });
    armIdle();
  } catch (err) {
    set({ status: 'off', error: `Microphone not available: ${(err as Error).message}` });
  }
}

function stop() {
  mic?.close();
  mic = undefined;
  clearTimeout(idle);
  useVoice.setState({ status: 'off', options: undefined });
}

function armIdle() {
  clearTimeout(idle);
  idle = setTimeout(stop, IDLE_OFF_MS);
}

async function transcribe(audio: Blob, format: string) {
  if (!mic) return;
  useVoice.setState({ status: 'thinking' });
  try {
    const r = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: await base64(audio), format, language: navigator.language.slice(0, 2).toLowerCase() }),
    });
    const out = (await r.json()) as { text?: string; error?: string };
    if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
    // Whisper writes something even for noise ("Grazie.", "Thank you."): those name nothing and fall to "unknown".
    if (out.text) useVoice.getState().run(out.text);
    armIdle();
  } catch (err) {
    useVoice.setState({ error: (err as Error).message });
  } finally {
    if (mic) useVoice.setState({ status: 'listening' });
  }
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
      if (path) s.openPath(path);
      return ws.towers[a.id].name;
    }
    case 'layer': {
      if (s.library) s.showLibrary(false);
      s.select(undefined);
      s.focusLayer(a.index);
      return `L${String(a.index + 1).padStart(2, '0')} ${tower.layers[a.index].title}`;
    }
    case 'node': {
      const t = ws.towers[a.tower];
      const layer = t.layers.findIndex((l) => l.nodes.some((n) => n.key === a.key));
      if (s.library) s.showLibrary(false);
      if (a.tower !== tower?.id) { const path = towerPath(ws, a.tower); if (path) s.openPath(path, a.key); } else s.select(a.key);
      useStore.getState().focusLayer(layer);
      return `${findNode(t, a.key)?.label} · ${t.layers[layer].title}`;
    }
    case 'view': chooseView(a.view); return a.view === 'map' ? 'Map view' : 'Tower view';
    case 'overview': s.select(undefined); s.resetView(); return 'Overview';
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
      if (node?.tower) { s.enterTower(node.tower); return ws.towers[node.tower]?.name ?? 'Sub-tower'; }
      return 'No sub-tower here';
    }
    case 'close': s.openFile(undefined); s.select(undefined); return 'Closed';
    case 'mic-off': setTimeout(stop); return 'Microphone off';
    case 'ambiguous': return `Which one? ${a.options.map((o, i) => `${i + 1}. ${o.label}`).join('  ')}`;
    case 'unknown': return 'Not understood';
  }
}
