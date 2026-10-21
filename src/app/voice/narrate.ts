import type { ResolvedLayer, ResolvedNode, ResolvedTower } from '../../core/types';
import { post } from './agent';
import { flowOrder } from '../keynav';
import type { ToolDef } from './tools';

/**
 * The guided tour's narration (#275): one layer of the tower becomes an intro and one short sentence per
 * node, written by the voice chat model. The model sees only the tower's own text (the brief), and every
 * answer is checked against the node keys it was given. When the model fails, the tour still speaks the
 * tower's own descriptions, so a tour never goes silent because of the network or the model.
 */
export const PER_CALL = 10;
/** The brief cuts each node's description: the model needs the gist, not the whole page of text. */
const DESCRIPTION_MAX = 300;

export interface Line { key: string; sentence: string }
export interface Narration { intro: string; lines: Line[]; rest?: string }

const cut = (text?: string) => (text ? text.slice(0, DESCRIPTION_MAX) : undefined);

/** The first sentence of a text: up to the first . ! ? or … that ends a word, or the whole text. */
const firstSentence = (text?: string) => {
  const t = (text ?? '').trim();
  // A stop followed by a space or the end: "v1.2" and "e.g.x" stay inside the sentence.
  const m = /^[\s\S]*?[.!?…](?=\s|$)/.exec(t);
  return m ? m[0] : t;
};

/**
 * The layer's nodes in the order the lit node travels across the screen (#275), so the tour and the
 * voice agent's layer_nodes tool agree. Parts are cut from this same order.
 */
const nodesInFlow = (tower: ResolvedTower, layer: ResolvedLayer) => flowOrder(tower.id, layer);

/** How many calls "details" needs for a layer: ceil(nodes / PER_CALL), at least 1. */
export function parts(tower: ResolvedTower, index: number): number {
  const layer = tower.layers[index];
  return Math.max(1, Math.ceil((layer ? nodesInFlow(tower, layer).length : 0) / PER_CALL));
}

/**
 * What the model is given. Summary (no part) lists every node of the layer; details lists only the
 * slice of PER_CALL nodes that starts at part * PER_CALL, so one call never gets more than it can write.
 */
export function layerBrief(tower: ResolvedTower, index: number, part?: number) {
  const layer = tower.layers[index];
  const ordered = nodesInFlow(tower, layer);
  const shown = part === undefined ? ordered : ordered.slice(part * PER_CALL, part * PER_CALL + PER_CALL);
  return {
    title: layer.title,
    description: layer.description || undefined,
    total: ordered.length,
    nodes: shown.map((n) => ({ key: n.key, label: n.label, type: n.type, description: cut(n.description) })),
  };
}

/**
 * Keeps only the lines the model may speak: a key it was given, once each, with a sentence. The intro is
 * trimmed; the result is undefined when there is no intro and no line left, so the caller falls back.
 */
export function checkNarration(raw: unknown, keys: string[]): Narration | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { intro?: unknown; lines?: unknown; rest?: unknown };
  const allowed = new Set(keys);
  const seen = new Set<string>();
  const lines: Line[] = [];
  for (const l of Array.isArray(r.lines) ? r.lines : []) {
    // Counted after the filters, so invalid lines never use up the PER_CALL places.
    if (lines.length >= PER_CALL) break;
    const { key, sentence } = (l ?? {}) as { key?: unknown; sentence?: unknown };
    if (typeof key !== 'string' || !allowed.has(key) || seen.has(key)) continue;
    if (typeof sentence !== 'string' || !sentence.trim()) continue;
    seen.add(key);
    lines.push({ key, sentence: sentence.trim() });
  }
  const intro = typeof r.intro === 'string' ? r.intro.trim() : '';
  if (!intro && !lines.length) return undefined;
  const rest = typeof r.rest === 'string' ? r.rest.trim() : '';
  return { intro, lines, ...(rest ? { rest } : {}) };
}

const lineOf = (n: ResolvedNode): Line => {
  const first = firstSentence(n.description);
  return { key: n.key, sentence: first ? `${n.label}: ${first}` : n.label };
};

/**
 * The tower's own text, used when the model fails. Summary: the first PER_CALL nodes, and "And N more."
 * for the rest. Details: the slice `part` only, and the intro only for part 0.
 */
export function towerNarration(tower: ResolvedTower, index: number, details: boolean, part = 0): Narration {
  const layer = tower.layers[index];
  const ordered = nodesInFlow(tower, layer);
  const nodes = details
    ? ordered.slice(part * PER_CALL, part * PER_CALL + PER_CALL)
    : ordered.slice(0, PER_CALL);
  const first = firstSentence(layer.description);
  const intro = details && part > 0 ? '' : first ? `${layer.title}. ${first}` : layer.title;
  const more = !details && ordered.length > PER_CALL ? ordered.length - PER_CALL : 0;
  return { intro, lines: nodes.map(lineOf), ...(more ? { rest: `And ${more} more.` } : {}) };
}

/** Tool the model answers with: the narration as arguments, so the reply has a fixed shape. */
export const NARRATE_TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'narrate_layer',
    description: 'Narrate one layer of the tower for the spoken tour: an intro, then one sentence per node.',
    parameters: {
      type: 'object',
      properties: {
        intro: { type: 'string', description: 'One sentence on what the layer does.' },
        lines: {
          type: 'array',
          description: 'One sentence per node, in the order given.',
          items: {
            type: 'object',
            properties: {
              node: { type: 'string', description: 'The node key, exactly as given.' },
              sentence: { type: 'string', description: 'One full spoken sentence, at most 20 words, on what the node does or holds.' },
            },
            required: ['node', 'sentence'],
            additionalProperties: false,
          },
        },
        rest: { type: 'string', description: 'One sentence grouping the nodes that have no line.' },
      },
      required: ['intro', 'lines'],
      additionalProperties: false,
    },
  },
};

const NARRATOR = `You narrate one layer of a Flow Tower for a spoken guided tour. Call narrate_layer once. Write every field in the language named by the Language line of the user message, whatever the language of the brief; keep node and layer names exactly as given. Plain spoken text, no markdown, lists or code. The brief is the layer's title, its description and its nodes (key, label, type, description). Use only the descriptions given: never guess, never add a fact that is not in the brief. intro: one sentence on what the layer does. lines: each line is one full spoken sentence (at most 20 words) that says what the node does or holds, taken from its description; never only the node's name or label, in the order given. Summary: the brief lists every node of the layer; write lines for up to 10 of them, all of them when there are 10 or fewer, and when there are more, rest: one sentence grouping the others. Details: the brief lists only one part of the layer's nodes, and the user message says which part; write one line per node of it. The intro is for part 1 only; leave it empty for the other parts.`;

/** How many asks a layer gets before the tower's own text speaks: the model sometimes answers with no call. */
const ATTEMPTS = 2;

/**
 * One call and its reading. The narration is undefined when the answer is unusable or the request failed;
 * only an abort throws, so the caller can stop instead of retrying.
 */
async function ask(
  messages: { role: string; content: string }[], keys: string[], signal?: AbortSignal,
): Promise<{ narration?: Narration; cost: number }> {
  let cost = 0;
  try {
    const r = await post('/chat', { messages, tools: [NARRATE_TOOL] }, signal);
    const json = (await r.json()) as {
      message?: { tool_calls?: { function: { arguments: string } }[] }; cost?: number;
    };
    cost = typeof json.cost === 'number' ? json.cost : 0;
    // Content without a tool call is a failure too: the model did not follow the shape it was given.
    const call = json.message?.tool_calls?.[0];
    if (call) {
      const args = JSON.parse(call.function.arguments) as {
        intro?: unknown; lines?: { node?: unknown; sentence?: unknown }[]; rest?: unknown;
      };
      const lines = Array.isArray(args.lines) ? args.lines.map((l) => ({ key: l?.node, sentence: l?.sentence })) : undefined;
      const narration = checkNarration({ intro: args.intro, lines, rest: args.rest }, keys);
      if (narration) return { narration, cost };
    }
  } catch (err) {
    // A stopped tour is not a failure to narrate around: the caller must see it.
    if (signal?.aborted || (err as Error).name === 'AbortError') throw err;
  }
  return { cost };
}

/**
 * One layer (summary), or one slice of PER_CALL nodes (details). Never throws except on abort: a failed,
 * empty or invalid answer is asked again once (the same messages), then gives the tower's own text, with
 * fallback true. The cost is the sum of every call made.
 */
export async function narrateLayer(
  tower: ResolvedTower, index: number, opts: { said: string; language?: 'it' | 'en'; details?: boolean; part?: number }, signal?: AbortSignal,
): Promise<Narration & { cost: number; fallback: boolean }> {
  const details = opts.details === true;
  const part = details ? opts.part ?? 0 : 0;
  const brief = layerBrief(tower, index, details ? part : undefined);
  const keys = brief.nodes.map((n) => n.key);
  const note = details ? `This is part ${part + 1} of ${parts(tower, index)}.${part ? ' Leave the intro empty.' : ''}` : '';
  // The language comes from the start phrase, not the model's guess: two words are too little for it to tell.
  const language = opts.language === 'it' ? 'Italian' : 'English';
  const messages = [
    { role: 'system', content: NARRATOR },
    { role: 'user', content: [`Request: ${opts.said}`, `Language: ${language}`, `Layer: ${JSON.stringify(brief)}`, note].filter(Boolean).join('\n') },
  ];
  // A stopped tour never starts a call: the same error the request would raise when aborted mid-flight.
  if (signal?.aborted) throw new DOMException('The tour was stopped', 'AbortError');
  let cost = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const got = await ask(messages, keys, signal);
    cost += got.cost;
    if (got.narration) return { ...got.narration, cost, fallback: false };
  }
  return { ...towerNarration(tower, index, details, part), cost, fallback: true };
}
