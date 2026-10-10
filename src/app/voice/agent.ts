import { runTool, runToolAsync, TOOLS } from './tools';

/**
 * The conversational voice agent (#63): the transcript goes to an LLM with the tools in tools.ts, which
 * run here on the tower on screen; the reply is shown and spoken. Navigation the local parser
 * understands never comes here: it stays instant. Best practices followed (examples/voice-commands,
 * options/llm-intent.md): short spoken replies in the user's language, screen state each turn, few tools,
 * a capped tool loop, actions confirmed only after the tool succeeded, and streaming: the text shows as
 * it arrives and the voice starts on the first sentence.
 */
const PROMPT = `You are the voice guide of Flow Tower, an app that shows a software or agent system as a 3D tower: layers top to bottom, nodes inside each layer left to right, edges between nodes. The user talks to you and your reply is spoken aloud.
- Reply in the language the user spoke in this turn (Italian, English or any other). Keep names of nodes, layers and files exactly as they are; they never make you switch language.
- Plain spoken text: no markdown, lists, code or URLs. One or two short sentences for a fact; up to four when explaining a flow or a file. Long lists stay on screen; say how many there are and name a few.
- Start with the answer itself, in a short first sentence: it is spoken while you write the rest.
- Use the tools to know what is on screen and to answer. Never guess names, counts, connections or file contents.
- Tools take names as the user says them ("triage", "fresh verifier", "layer 2", "MCP"): call node_info, connections or node_files directly with the name, without listing layers first.
- Be quick: call the tools you need together in one step (for example focus_layer with layer_nodes, or select_node with node_info), then answer.
- When you talk about a layer or a node, also show it with focus_layer or select_node. A layer's flow is in layer_nodes: explain it in order, from where work enters to where it leaves.
- Files: node_files lists them; open_file shows one; read_file opens it and gives you its text, to explain what it does, its main parts and its role in the node. "this file" / "questo file" is the file open now.
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

/** Server-sent events from the streamed chat completion, as parsed JSON chunks. */
async function* chunks(r: Response) {
  const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith('data:')) continue; // comments keep the connection alive
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data) as Chunk; } catch { /* a partial or foreign line */ }
    }
  }
}
interface Chunk {
  choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
  usage?: { cost?: number };
}

/** What the caption shows while a tool runs: the user sees the agent work instead of a silence. */
function stepLabel(name: string, args: Record<string, unknown>) {
  const what = String(args.node ?? args.layer ?? args.query ?? args.name ?? '').trim();
  const labels: Record<string, string> = {
    screen: 'Looking at the screen', list_layers: 'Reading the layers', layer_nodes: 'Reading layer', node_info: 'Reading',
    connections: 'Following the connections of', node_files: 'Listing the files of', search: 'Searching for', focus_layer: 'Showing layer',
    select_node: 'Selecting', open_file: 'Opening a file', read_file: 'Reading the file', open_project: 'Opening', navigate: 'Moving',
  };
  return `${labels[name] ?? name}${what ? ` ${what}` : ''}…`;
}

export interface Turn { reply: string; tools: string[]; ms: number; cost: number }
export interface TurnEvents {
  /** A tool is running. */
  step?(label: string): void;
  /** The reply so far, as it streams. */
  text?(reply: string): void;
  /** A finished sentence, ready to be spoken. */
  sentence?(sentence: string): void;
}

/** A sentence ends at . ! ? … followed by a space: long enough to be worth speaking on its own. */
const SENTENCE = /[.!?…](\s+|$)/g;

/** One conversational turn: streamed LLM steps with tool calls until it answers (capped). */
export async function converse(text: string, on: TurnEvents = {}, signal?: AbortSignal, notes = ''): Promise<Turn> {
  const started = performance.now();
  const messages: Message[] = [
    { role: 'system', content: PROMPT },
    // What this user accepted from reviews of past sessions (#68): their rules and reply style.
    ...(notes ? [{ role: 'system' as const, content: `Learned from this user's past sessions (they approved these):\n${notes}` }] : []),
    ...history,
    { role: 'system', content: `Screen now: ${runTool('screen', {})}` },
    { role: 'user', content: text },
  ];
  const used: string[] = [];
  let cost = 0;
  let reply = '';
  for (let step = 0; step < MAX_STEPS && !reply; step++) {
    // The last step may not call tools any more: it has to answer with what it has.
    const r = await post('/chat', { messages, tools: TOOLS, answer: step === MAX_STEPS - 1, stream: true }, signal);
    let content = '';
    let spoken = 0;
    const calls: ToolCall[] = [];
    for await (const c of chunks(r)) {
      cost += c.usage?.cost ?? 0;
      const delta = c.choices?.[0]?.delta;
      for (const t of delta?.tool_calls ?? []) {
        const call = (calls[t.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (t.id) call.id = t.id;
        call.function.name += t.function?.name ?? '';
        call.function.arguments += t.function?.arguments ?? '';
      }
      if (delta?.content) {
        content += delta.content;
        on.text?.(content);
        // Hand over every finished sentence at once, so speech starts while the rest is written.
        const base = spoken;
        for (const m of content.slice(base).matchAll(SENTENCE)) {
          const end = base + m.index + m[0].length;
          const sentence = content.slice(spoken, end).trim();
          if (sentence.length >= 12 || end - spoken > 40) { on.sentence?.(sentence); spoken = end; }
        }
      }
    }
    messages.push({ role: 'assistant', content: content || null, ...(calls.length && { tool_calls: calls }) });
    if (calls.length) {
      for (const c of calls) {
        if (signal?.aborted) throw new Error('stopped'); // the mic went off: no more moves on screen
        used.push(c.function.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* the tool reports the bad call */ }
        on.step?.(stepLabel(c.function.name, args));
        messages.push({ role: 'tool', tool_call_id: c.id, content: await runToolAsync(c.function.name, args) });
      }
    } else {
      reply = content.trim();
      const rest = content.slice(spoken).trim();
      if (rest) on.sentence?.(rest);
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
 * Spoken replies, sentence by sentence: each sentence is synthesized as soon as it is written (in
 * parallel) and played in order through an <audio> element. Browsers cancel the echo of media elements
 * in the mic (getUserMedia echoCancellation), so the agent does not hear itself. stopSpeaking() is the barge-in.
 */
let queue: Promise<Blob | undefined>[] = [];
let playing: HTMLAudioElement | undefined;
let abort = new AbortController();
let spokenText = '';
let speakingUntil = 0;

export function say(sentence: string) {
  spokenText += ` ${sentence}`;
  speakingUntil = Infinity;
  const signal = abort.signal;
  queue.push(post('/speak', { text: sentence }, signal).then((r) => r.blob()).catch(() => undefined));
  // One player at a time: set before the first blob arrives, or every sentence would start its own.
  if (!draining) { draining = true; void playNext(signal); }
}

let draining = false;

async function playNext(signal: AbortSignal) {
  if (signal.aborted) return; // stopSpeaking() already freed the player: the queue now belongs to the next reply
  const next = queue.shift();
  if (!next) { draining = false; playing = undefined; speakingUntil = performance.now() + 800; return; }
  const blob = await next;
  if (signal.aborted) return;
  if (!blob) return playNext(signal); // a failed sentence is skipped, not fatal
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  playing = audio;
  audio.onended = () => { URL.revokeObjectURL(url); void playNext(signal); };
  await audio.play().catch(() => playNext(signal));
}

/** A new reply: forget what the last one said (the echo filter compares with this reply only). */
export function newReply() {
  stopSpeaking();
  spokenText = '';
}

export function stopSpeaking() {
  abort.abort();
  abort = new AbortController();
  queue = [];
  draining = false;
  playing?.pause();
  playing = undefined;
  speakingUntil = performance.now() + 800;
}

export const isSpeaking = () => !!playing || queue.length > 0;

/** A transcript of our own reply caught by the mic (echo the canceller missed): drop it. */
export function isEcho(transcript: string) {
  if (performance.now() > speakingUntil) return false;
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const heard = words(transcript);
  const said = words(spokenText);
  if (!heard.size) return false;
  return [...heard].filter((w) => said.has(w)).length / heard.size >= 0.6;
}

/** Questions and requests about the screen go to the agent; plain navigation stays with the parser. */
export function wantsAgent(text: string) {
  // Verb stems, not whole words: "spiegami", "descrivimi", "raccontami", "riassumi", "explaining".
  return /\?|^\s*(cosa|che|quali|quanti|quante|come|perch|chi|dove|quando|what|which|how|why|who|where|when|is there|are there)\b/i.test(text)
    || /\b(spieg|descriv|raccont|riassum|illustr|dimmi|parlami|elenc|explain|describe|tell me|summar|walk me|list )/i.test(text)
    || /\b(questo|questa|this|file|files|collegat|connected|connection|connessi|flusso|flow|funziona|works|il primo|la prima|il secondo|the first|the second|open it|aprilo|aprila)\b/i.test(text);
}
