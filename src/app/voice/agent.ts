import { runTool, TOOLS } from './tools';

/**
 * The conversational voice agent (#63): the transcript goes to an LLM with the tools in tools.ts, which
 * run here on the tower on screen; the short reply is shown and spoken. Navigation the local parser
 * understands never comes here: it stays instant. Best practices followed (examples/voice-commands,
 * options/llm-intent.md): 1-2 spoken sentences, the user's language, screen state each turn, few tools,
 * a capped tool loop, actions confirmed only after the tool succeeded.
 */
const PROMPT = `You are the voice guide of Flow Tower, an app that shows a software or agent system as a 3D tower: layers top to bottom, nodes inside each layer left to right, edges between nodes. The user talks to you and your reply is spoken aloud.
- Reply in the language the user spoke in this turn (Italian, English or any other). Keep names of nodes, layers and files exactly as they are; they never make you switch language.
- Speak one or two short sentences of plain text: no markdown, lists, code or URLs. Long lists stay on screen; say how many there are and name a few.
- Use the tools to know what is on screen and to answer. Never guess names, counts or connections.
- Tools take names as the user says them ("triage", "fresh verifier", "layer 2", "MCP"): call node_info, connections or node_files directly with the name, without listing layers first.
- Be quick: call the tools you need together in one step (for example select_node with node_info, or focus_layer with layer_nodes), then answer.
- When you talk about a layer or a node, also show it with focus_layer or select_node. For files: node_files, then open_file the one asked for (the first if unsure), and say which file is open and how many there are.
- "this node" / "questo nodo" is the selected node: leave the node argument out. Questions without "this" ("how many MCP servers are there?") are about the whole tower: use search or list_layers, not the selection. "the first" / "il primo" refers to your last list.
- Say an action is done only after its tool succeeded. If a tool returns an error, fix the call once or ask one short question.
- For anything unrelated to the tower or the app, say in one sentence what you can do.`;

type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content?: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

const MAX_STEPS = 4;
const HISTORY = 12;
const history: Message[] = [];
const VOICE_HEADER = 'x-flow-tower-voice';

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const r = await fetch(`/api/voice${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', [VOICE_HEADER]: '1' }, body: JSON.stringify(body), signal,
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  return r;
}

export interface Turn { reply: string; tools: string[]; ms: number; cost: number }

/** One conversational turn: LLM steps with tool calls until it answers (capped). */
export async function converse(text: string, signal?: AbortSignal): Promise<Turn> {
  const started = performance.now();
  const messages: Message[] = [
    { role: 'system', content: PROMPT },
    ...history,
    { role: 'system', content: `Screen now: ${runTool('screen', {})}` },
    { role: 'user', content: text },
  ];
  const used: string[] = [];
  let cost = 0;
  let reply = '';
  for (let step = 0; step < MAX_STEPS && !reply; step++) {
    // The last step may not call tools any more: it has to answer with what it has.
    const out = (await (await post('/chat', { messages, tools: TOOLS, answer: step === MAX_STEPS - 1 }, signal)).json()) as {
      message: { content?: string | null; tool_calls?: ToolCall[] }; cost?: number;
    };
    cost += out.cost ?? 0;
    const m = out.message;
    messages.push({ role: 'assistant', content: m.content ?? null, ...(m.tool_calls?.length && { tool_calls: m.tool_calls }) });
    if (m.tool_calls?.length) {
      for (const c of m.tool_calls) {
        used.push(c.function.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* the tool reports the bad call */ }
        messages.push({ role: 'tool', tool_call_id: c.id, content: runTool(c.function.name, args) });
      }
    } else {
      reply = (m.content ?? '').trim();
    }
  }
  reply ||= '…';
  // Only the words, not the tool traffic, carry over: short context, fast turns.
  history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
  history.splice(0, Math.max(0, history.length - HISTORY));
  return { reply, tools: used, ms: Math.round(performance.now() - started), cost };
}

export const forget = () => { history.length = 0; };

/**
 * Spoken replies through an <audio> element: browsers cancel the echo of media elements in the mic
 * (getUserMedia echoCancellation), so the agent does not hear itself. stopSpeaking() is the barge-in.
 */
let audio: HTMLAudioElement | undefined;
let lastSpoken = '';
let speakingUntil = 0;

export async function speak(text: string, signal?: AbortSignal) {
  stopSpeaking();
  const r = await post('/speak', { text }, signal);
  const url = URL.createObjectURL(await r.blob());
  audio = new Audio(url);
  lastSpoken = text;
  audio.onended = audio.onpause = () => { URL.revokeObjectURL(url); speakingUntil = performance.now() + 800; };
  speakingUntil = Infinity;
  await audio.play();
}

export function stopSpeaking() {
  if (audio && !audio.paused) audio.pause();
  audio = undefined;
}

export const isSpeaking = () => !!audio && !audio.paused;

/** A transcript of our own reply caught by the mic (echo the canceller missed): drop it. */
export function isEcho(transcript: string) {
  if (performance.now() > speakingUntil) return false;
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const heard = words(transcript);
  const said = words(lastSpoken);
  if (!heard.size) return false;
  return [...heard].filter((w) => said.has(w)).length / heard.size >= 0.6;
}

/** Questions and requests about the screen go to the agent; plain navigation stays with the parser. */
export function wantsAgent(text: string) {
  return /\?|^\s*(cosa|che|quali|quanti|quante|come|perch|chi|dove|quando|dimmi|spiega|descriv|raccont|elenca|what|which|how|why|who|where|when|tell|explain|describe|list|is there|are there)\b/i.test(text)
    || /\b(questo|questa|this|file|files|collegat|connected|connection|connessi|il primo|la prima|il secondo|the first|the second|open it|aprilo|aprila)\b/i.test(text);
}
