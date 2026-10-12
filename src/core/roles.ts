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

/** Id or label words that say the node leads other agents (checked before review, see classifyNode). */
const ORCHESTRATOR_WORDS = ['lead', 'orchestrat', 'planner', 'manager'];
/** Id or label words that say the node judges work. Checked before tools: a reviewer with Bash still reviews. */
const REVIEW_WORDS = ['review', 'judge', 'critic', 'verif', 'audit'];
/** Tool names (after "Name(args)" or "mcp__server__") that change files or run commands. */
const CODING_TOOLS = ['edit', 'write', 'bash'];
const RESEARCH_TOOLS = ['web', 'search', 'fetch'];
const KEYWORDS: [string[], RoleId][] = [
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
 * The role of one node, from facts only. Order (first match wins), and `why` names the fact used.
 * The order follows what the node is *for* before the tools it happens to carry: a reviewer with
 * Bash is still a reviewer, and a lead that spawns agents is an orchestrator, not a coder.
 *  1. node type: guard → guard, decision → router (the type says what the node is for).
 *  2. model id hints: a specialised model (whisper, tts, realtime, embed, image, video) names its role.
 *  3. delegation: an outgoing spawn edge, or id/label words lead, orchestrat, planner,
 *     manager → orchestrator. A handoff is not delegation: it is how a worker hands back to the lead.
 *  4. id/label words review, judge, critic, verif, audit → review.
 *  5. tools: file or shell tools → coding, web or fetch tools → research.
 *  6. other keywords in id, label or description: writing, data, router (see KEYWORDS).
 *  7. nothing matched → general.
 * `delegates` is true when the tower has an outgoing spawn edge from the node, since a node does not
 * carry its edges.
 */
export function classifyNode(node: ResolvedNode, delegates = false): { role: RoleId; why: string } {
  if (node.type === 'guard') return { role: 'guard', why: 'node type is guard' };
  if (node.type === 'decision') return { role: 'router', why: 'node type is decision' };

  const model = modelOf(node)?.toLowerCase();
  if (model) {
    for (const [re, role] of MODEL_HINTS) {
      const hit = model.match(re);
      if (hit) return { role, why: `model "${modelOf(node)}" contains "${hit[0]}"` };
    }
  }

  const name = [node.id, node.label ?? ''].join(' ').toLowerCase();
  if (delegates) return { role: 'orchestrator', why: 'has an outgoing spawn edge' };
  const lead = ORCHESTRATOR_WORDS.find((w) => name.includes(w));
  if (lead) return { role: 'orchestrator', why: `"${lead}" in id or label` };

  const review = REVIEW_WORDS.find((w) => name.includes(w));
  if (review) return { role: 'review', why: `"${review}" in id or label` };

  const bases = node.tools.map(toolBase);
  const coding = bases.find((b) => CODING_TOOLS.some((t) => b.includes(t)));
  if (coding) return { role: 'coding', why: `tool "${coding}" edits files or runs commands` };
  const research = bases.find((b) => RESEARCH_TOOLS.some((t) => b.includes(t)));
  if (research) return { role: 'research', why: `tool "${research}" searches or fetches the web` };

  const text = [name, node.description ?? ''].join(' ');
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

/**
 * Node types that never get a model fit. A `model` node is a model registry entry, not a role; the
 * rest are plumbing (tools, memory, hooks) or the ends of the flow (entry, output).
 */
const NO_FIT_TYPES = new Set(['model', 'tool', 'memory', 'hook', 'entry', 'output']);

/**
 * Per node that runs a model (type agent, or any node with a model on it): the role, and the
 * categories and needs to look for in a model. A process or human node with no model runs no model,
 * so it has no fit; a decision or guard with a model is a router or guard and stays in.
 */
export function modelFit(tower: ResolvedTower): ModelFit[] {
  const nodes = tower.layers.flatMap((l) => l.nodes);
  const edges = [...tower.layers.flatMap((l) => l.edges), ...tower.links];
  const out: ModelFit[] = [];
  for (const n of nodes) {
    if (NO_FIT_TYPES.has(n.type)) continue;
    const model = modelOf(n);
    if (n.type !== 'agent' && !model) continue;
    const delegates = edges.some((e) => e.from === n.key && e.kind === 'spawn');
    const { role } = classifyNode(n, delegates);
    const cls = roleById.get(role)!;
    out.push({ node: n.key, role, model, categories: cls.categories, needs: cls.needs, prefer: cls.prefer });
  }
  return out;
}
