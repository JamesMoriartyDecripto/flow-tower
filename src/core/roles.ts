import type { ResolvedNode, ResolvedTower } from './types.ts';

/**
 * Role classes for the optimizer (phase 4): what a node needs, mapped to OpenRouter categories and
 * capabilities. Deterministic: the same node in, the same role out. No model is asked, so the same
 * tower always gets the same plan, and the result can be diffed.
 */

export interface RoleClass {
  id: RoleId;
  title: string;
  /** Capability words the model must have (tools, structured-output, long-context, ...). */
  needs: readonly string[];
  /** OpenRouter category slugs; empty when no slug fits. */
  categories: readonly string[];
  modality: { in: readonly string[]; out: readonly string[] };
  /** One line for the optimizer's shortlist: what to look for in a model. */
  prefer: string;
}

// Categories are the slugs seen on openrouter.ai/models on 2026-10-12. Roles with no slug use [].
const ROLE_TABLE = [
  { id: 'coding', title: 'Coding', needs: ['tools', 'reasoning'], categories: ['programming'], modality: { in: ['text'], out: ['text'] }, prefer: 'strong code model with reliable tool calls; long context helps on big repos' },
  { id: 'review', title: 'Review', needs: ['reasoning', 'structured-output'], categories: ['programming'], modality: { in: ['text'], out: ['text'] }, prefer: 'judges the work against a rubric; a model that is not the author is a fair judge' },
  { id: 'orchestrator', title: 'Orchestrator', needs: ['tools', 'reasoning'], categories: [], modality: { in: ['text'], out: ['text'] }, prefer: 'plans and delegates; follows instructions and calls tools reliably' },
  { id: 'router', title: 'Router', needs: ['low-latency', 'structured-output'], categories: [], modality: { in: ['text'], out: ['text'] }, prefer: 'small and fast; picks one label out of a few' },
  { id: 'research', title: 'Research', needs: ['tools', 'long-context', 'citations'], categories: ['academia'], modality: { in: ['text'], out: ['text'] }, prefer: 'web search or retrieval, long context, cites its sources' },
  { id: 'writing', title: 'Writing', needs: ['long-context'], categories: ['marketing', 'translation'], modality: { in: ['text'], out: ['text'] }, prefer: 'fluent long-form prose; for translation, strong in the target language' },
  { id: 'data', title: 'Data', needs: ['structured-output'], categories: [], modality: { in: ['text'], out: ['text'] }, prefer: 'extracts into a JSON schema; low temperature, same answer each run' },
  { id: 'voice-stt', title: 'Speech to text', needs: ['streaming-audio', 'low-latency'], categories: [], modality: { in: ['audio'], out: ['text'] }, prefer: 'streaming transcription; latency matters more than polish' },
  { id: 'voice-tts', title: 'Text to speech', needs: ['streaming-audio', 'low-latency'], categories: [], modality: { in: ['text'], out: ['audio'] }, prefer: 'fast first audio chunk; natural voice' },
  { id: 'realtime-voice', title: 'Realtime voice', needs: ['streaming-audio', 'low-latency', 'tools'], categories: [], modality: { in: ['audio', 'text'], out: ['audio', 'text'] }, prefer: 'speech in and out with barge-in and tool calls mid-conversation' },
  { id: 'vision', title: 'Vision', needs: ['vision'], categories: [], modality: { in: ['text', 'image'], out: ['text'] }, prefer: 'reads images and screenshots accurately' },
  { id: 'image-gen', title: 'Image generation', needs: [], categories: [], modality: { in: ['text'], out: ['image'] }, prefer: 'text to image; prompt adherence and cost per image' },
  { id: 'video-gen', title: 'Video generation', needs: [], categories: [], modality: { in: ['text'], out: ['video'] }, prefer: 'text to video; clip length and cost per second' },
  { id: 'embeddings', title: 'Embeddings', needs: [], categories: [], modality: { in: ['text'], out: ['embedding'] }, prefer: 'cheap, stable vectors; index and query must use the same model' },
  { id: 'guard', title: 'Guard', needs: ['low-latency', 'structured-output'], categories: [], modality: { in: ['text'], out: ['text'] }, prefer: 'small moderation or safety classifier; returns a label and a score' },
  { id: 'general', title: 'General', needs: [], categories: [], modality: { in: ['text'], out: ['text'] }, prefer: 'balanced default; no specific need was detected' },
] as const;

export type RoleId = (typeof ROLE_TABLE)[number]['id'];

export const ROLE_CLASSES: readonly RoleClass[] = ROLE_TABLE;

const roleById = new Map<RoleId, RoleClass>(ROLE_CLASSES.map((r) => [r.id, r]));

/** Model id fragments that name a specialised model, checked in this order (first hit wins). */
const MODEL_HINTS: [RegExp, RoleId][] = [
  [/whisper|stt|transcrib/, 'voice-stt'],
  [/tts|speech|voice/, 'voice-tts'],
  [/realtime/, 'realtime-voice'],
  [/embed/, 'embeddings'],
  [/image|flux|dall/, 'image-gen'],
  [/video|veo|sora/, 'video-gen'],
];

/** Tool names (after "Name(args)" or "mcp__server__") that change files or run commands. */
const CODING_TOOLS = ['edit', 'write', 'bash'];
const RESEARCH_TOOLS = ['web', 'search', 'fetch'];
const KEYWORDS: [string[], RoleId][] = [
  [['review', 'judge', 'critic'], 'review'],
  [['translat', 'write', 'draft', 'copy'], 'writing'],
  [['extract', 'parse'], 'data'],
  [['classif'], 'router'],
];

/** "Bash(git:*)" → "bash", "mcp__box__search" → "search". */
function toolBase(name: string): string {
  return name.toLowerCase().split('(')[0].split('__').pop() ?? '';
}

const modelOf = (node: ResolvedNode): string | undefined => node.model ?? node.agent?.model;

/**
 * The role of one node, from facts only. Order (first match wins), and `why` names the fact used:
 *  1. node type: guard → guard, decision → router (the type says what the node is for).
 *  2. model id hints: a specialised model (whisper, tts, realtime, embed, image, video) names its role.
 *  3. tools: file or shell tools → coding, web or fetch tools → research.
 *  4. outgoing spawn edges → orchestrator (the node hands work to other agents).
 *  5. keywords in id, label or description: review, writing, data, router (see KEYWORDS).
 *  6. nothing matched → general.
 * `outgoingSpawn` comes from the tower's edges, since a node does not carry its edges.
 */
export function classifyNode(node: ResolvedNode, outgoingSpawn = false): { role: RoleId; why: string } {
  if (node.type === 'guard') return { role: 'guard', why: 'node type is guard' };
  if (node.type === 'decision') return { role: 'router', why: 'node type is decision' };

  const model = modelOf(node)?.toLowerCase();
  if (model) {
    for (const [re, role] of MODEL_HINTS) {
      const hit = model.match(re);
      if (hit) return { role, why: `model "${modelOf(node)}" contains "${hit[0]}"` };
    }
  }

  const bases = node.tools.map(toolBase);
  const coding = bases.find((b) => CODING_TOOLS.some((t) => b.includes(t)));
  if (coding) return { role: 'coding', why: `tool "${coding}" edits files or runs commands` };
  const research = bases.find((b) => RESEARCH_TOOLS.some((t) => b.includes(t)));
  if (research) return { role: 'research', why: `tool "${research}" searches or fetches the web` };

  if (outgoingSpawn) return { role: 'orchestrator', why: 'has an outgoing spawn edge' };

  const text = [node.id, node.label, node.description ?? ''].join(' ').toLowerCase();
  for (const [words, role] of KEYWORDS) {
    const hit = words.find((w) => text.includes(w));
    if (hit) return { role, why: `keyword "${hit}" in id, label or description` };
  }

  return { role: 'general', why: 'no fact matched a specific role' };
}

export interface ModelFit {
  /** Node key ("layer.node"). */
  node: string;
  role: RoleId;
  model?: string;
  categories: readonly string[];
  needs: readonly string[];
  prefer: string;
}

/** Per agent or model node: the role, and the categories and needs to look for in a model. */
export function modelFit(tower: ResolvedTower): ModelFit[] {
  const nodes = tower.layers.flatMap((l) => l.nodes);
  const edges = [...tower.layers.flatMap((l) => l.edges), ...tower.links];
  const out: ModelFit[] = [];
  for (const n of nodes) {
    if (n.type !== 'agent' && n.type !== 'model') continue;
    const model = modelOf(n);
    const spawns = edges.some((e) => e.from === n.key && e.kind === 'spawn');
    const { role } = classifyNode(n, spawns);
    const cls = roleById.get(role)!;
    out.push({ node: n.key, role, model, categories: cls.categories, needs: cls.needs, prefer: cls.prefer });
  }
  return out;
}
