import type { ResolvedTower, Workspace } from '../../core/types';

/**
 * Voice commands, Italian and English, without an LLM: the transcript is matched against the
 * names of what is on screen (projects, layers, nodes). Matching is instant and runs offline.
 * Pure, so it is unit-tested (tests/voice-commands.test.ts).
 */
export type VoiceAction =
  | { kind: 'library' }
  | { kind: 'tower'; id: string }
  | { kind: 'layer'; index: number }
  | { kind: 'node'; tower: string; key: string }
  | { kind: 'view'; view: 'map' | 'tower' }
  | { kind: 'overview' }
  | { kind: 'back' }
  | { kind: 'enter' }
  | { kind: 'close' }
  | { kind: 'mic-off' }
  | { kind: 'ambiguous'; options: { label: string; action: VoiceAction }[] }
  | { kind: 'unknown' };

/** `tower`: the one on screen (or behind the library); `library`: the library is open, so names mean projects first. */
export interface VoiceContext { ws: Workspace; tower?: ResolvedTower; library?: boolean }

/** Lowercase, no accents, no punctuation: "Più Livelli!" → "piu livelli". */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const STOP = new Set(('il lo la i gli le l un una uno del dello della dei degli delle di da al allo alla ai agli alle a in su per con ' +
  'the a an of to on in at for and e ed please per favore mi ci fammi fai vedere puoi potresti vorrei ' +
  'me you can could would i like now just ok okay adesso ora').split(' '));
// Command words are not part of a name: "vai al nodo del triage" names "triage".
const VERBS = new Set(('apri aprire aprimi apriamo open mostra mostrami show vai andiamo passa passiamo spostati portami vediamo vedere ' +
  'entriamo torniamo voglio vorrei go goto take bring select seleziona livelli layers nodi nodes ' +
  'progetto project torre tower livello livelli layer level piano nodo node vista view voglio want see let s lets').split(' '));

const ORDINALS: Record<string, number> = {
  primo: 1, prima: 1, secondo: 2, seconda: 2, terzo: 3, terza: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5, sesto: 6, sesta: 6,
  settimo: 7, settima: 7, ottavo: 8, ottava: 8, nono: 9, nona: 9, decimo: 10, decima: 10, undicesimo: 11, dodicesimo: 12,
  uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const has = (words: string[], ...any: string[]) => any.some((w) => words.includes(w));
/** A command word, forgiving one wrong letter in longer words: Whisper hears "vista matta" for "vista mappa". */
const like = (words: string[], ...keys: string[]) =>
  keys.some((k) => words.some((w) => w === k || (k.length >= 5 && w.length >= 4 && distance(w, k) <= 1)));
const phrase = (text: string, re: RegExp) => re.test(text);

/** Edit distance, for misheard words ("triaje" → "triage"). */
function distance(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return d[b.length];
}

const close = (a: string, b: string) => a === b
  || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))
  || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1));

/** How well the spoken words name a candidate: 0 (no) to 1 (every word, nothing else). */
export function score(words: string[], name: string) {
  const target = norm(name).split(' ').filter((w) => w && !STOP.has(w));
  if (!words.length || !target.length) return 0;
  // "devsquad" heard as one word still names "dev squad".
  const joined = target.join('');
  if (words.join('') === joined) return 1;
  const hit = words.filter((w) => target.some((t) => close(w, t))).length;
  const covered = target.filter((t) => words.some((w) => close(w, t))).length;
  return hit ? 0.7 * (hit / words.length) + 0.3 * (covered / target.length) : 0;
}

interface Candidate { label: string; names: string[]; action: VoiceAction }

/** Best candidate; several close ones are returned as a choice. */
function best(words: string[], candidates: Candidate[], min = 0.5): VoiceAction | undefined {
  const ranked = candidates
    .map((c) => ({ c, s: Math.max(...c.names.map((n) => score(words, n))) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return undefined;
  const top = ranked.filter((x) => x.s >= ranked[0].s - 0.05);
  if (top.length === 1) return top[0].c.action;
  return { kind: 'ambiguous', options: top.slice(0, 4).map((x) => ({ label: x.c.label, action: x.c.action })) };
}

const towerCandidates = (ws: Workspace, only?: string[]): Candidate[] => (only ?? Object.keys(ws.towers)).map((id) => ({
  label: ws.towers[id].name,
  names: [ws.towers[id].name, id.split('/').pop()!.replace(/\.tower\.yaml$/, '').replace(/[-_]/g, ' ')],
  action: { kind: 'tower', id },
}));

const layerCandidates = (t: ResolvedTower): Candidate[] => t.layers.map((l, index) => ({
  label: l.title, names: [l.title, l.id.replace(/[-_]/g, ' ')], action: { kind: 'layer', index },
}));

const nodeCandidates = (t: ResolvedTower): Candidate[] => t.layers.flatMap((l) => l.nodes.map((n) => ({
  label: `${n.label} (${l.title})`,
  names: [n.label, n.id.replace(/[-_]/g, ' '), ...(n.agent ? [n.agent.name, n.agent.id.replace(/[-_]/g, ' ')] : [])],
  action: { kind: 'node', tower: t.id, key: n.key } as VoiceAction,
})));

/** The layer number in "il terzo livello", "layer 3", "L03", or "the last layer". */
function layerNumber(words: string[], t: ResolvedTower): number | undefined {
  if (has(words, 'ultimo', 'ultima', 'last')) return t.layers.length - 1;
  for (const w of words) {
    const n = ORDINALS[w] ?? (/^l?0*(\d{1,2})$/.test(w) ? Number(w.replace(/^l/, '')) : undefined);
    if (n && n <= t.layers.length) return n - 1;
  }
}

export function parseCommand(transcript: string, { ws, tower, library }: VoiceContext): VoiceAction {
  const text = norm(transcript);
  const all = text.split(' ').filter(Boolean);
  const words = all.filter((w) => !STOP.has(w) && !VERBS.has(w));

  if (phrase(text, /\b(spegni|disattiva|ferma|stop|turn off)\b.*\b(microfono|ascolto|voce|mic|microphone|listening)\b|^stop listening$/)) return { kind: 'mic-off' };
  const saysNode = like(all, 'nodo', 'node', 'agente', 'agent');
  // A node named "Home" or "Map view" must stay reachable: the shortcuts below yield to an explicit node.
  // "progetti" stays exact: one letter from "progetto", which opens a project.
  if (!saysNode && (like(all, 'libreria', 'library') || has(all, 'home', 'progetti', 'projects')) && words.length <= 2) return { kind: 'library' };
  if (phrase(text, /^(indietro|torna indietro|back|go back|esci|su)$/)) return { kind: 'back' };
  if (phrase(text, /\b(panoramica|overview|insieme|tutta la torre|whole tower|tutti i livelli|all layers)\b/)) return { kind: 'overview' };
  if (!saysNode && like(all, 'mappa', 'map')) return { kind: 'view', view: 'map' };
  if (phrase(text, /\b(vista|view|modalita|mode) (torre|tower|3d)\b|\b(torre|tower) (view|3d)\b/)) return { kind: 'view', view: 'tower' };
  // Only two views exist: "vista <anything else>" is the map, however Whisper spelled it ("vista matta").
  if (phrase(text, /^(vista|view) \w+$|^\w+ view$/)) return { kind: 'view', view: 'map' };
  if (phrase(text, /^(entra|enter|dive in|apri la sotto ?torre|open the sub ?tower|dentro)$/)) return { kind: 'enter' };
  if (phrase(text, /^(chiudi|close|deseleziona|deselect|chiudi il pannello|close the panel)$/)) return { kind: 'close' };

  const saysTower = like(all, 'progetto', 'project', 'torre', 'tower', 'apri', 'open', 'aprimi');
  const saysLayer = like(all, 'livello', 'livelli', 'layer', 'level', 'piano');

  if (tower && saysLayer && !saysNode) {
    const n = layerNumber(words, tower);
    if (n !== undefined) return { kind: 'layer', index: n };
    return best(words, layerCandidates(tower)) ?? { kind: 'unknown' };
  }
  if (tower && saysNode) return best(words, nodeCandidates(tower)) ?? { kind: 'unknown' };
  if (saysTower) {
    const hit = best(words, towerCandidates(ws, ws.projects)) ?? best(words, towerCandidates(ws));
    if (hit) return hit;
  }
  // No keyword: whatever the words name best. In the library that is a project; in a tower, a layer or a node.
  if (!tower || library) {
    const hit = best(words, towerCandidates(ws));
    if (hit || !tower) return hit ?? { kind: 'unknown' };
  }
  return best(words, [...layerCandidates(tower), ...nodeCandidates(tower)])
    ?? best(words, towerCandidates(ws), 0.7)
    ?? { kind: 'unknown' };
}
