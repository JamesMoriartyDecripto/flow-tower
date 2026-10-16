// Task files: shared by bench.mjs (what to send) and judge.mjs (how to check).
// A task is Markdown with a small front matter and two sections:
//   ## Prompt   sent to the model, nothing else is
//   ## Expected never sent: the answer key, written before the first run
// Front matter `endpoint:` picks the OpenRouter endpoint (default chat). Non-chat endpoints that take a body
// (decisions, embeddings, rerank) carry it as a ```json block under "## Request"; the others send "## Prompt".
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const CHECKS = ['command', 'json', 'regex', 'rubric', 'wer', 'wer-roundtrip', 'vision-judge'];
export const ENDPOINTS = ['chat', 'decisions', 'embeddings', 'rerank', 'images', 'videos', 'speech', 'transcriptions'];
// Endpoints whose input is the "## Request" json, and the keys that json must hold.
const REQUEST_KEYS = { decisions: ['state', 'questions'], embeddings: ['corpus', 'queries'], rerank: ['query', 'documents'] };
// Image fixtures: the media type sent in the data URL, by extension.
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export function mimeOf(name) {
  return IMAGE_TYPES[String(name).split('.').pop().toLowerCase()];
}

function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return [{}, text];
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return [meta, text.slice(m[0].length)];
}

// A section runs to the next "## " heading outside a code fence: patterns may start with "## " themselves.
function section(body, name) {
  const out = [];
  let inside = false, fence = false;
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    if (!fence && /^## /.test(line)) { inside = line.trim() === `## ${name}`; continue; }
    if (inside) out.push(line);
  }
  return out.join('\n').trim();
}

// Fenced blocks of one language inside a section: ```json, ```regex, ```must-not.
export function blocks(text, lang) {
  return [...text.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1].trim());
}

export function loadTask(file) {
  const text = readFileSync(file, 'utf8');
  const [meta, body] = frontMatter(text);
  const dir = resolve(file, '..');
  const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const requestText = section(body, 'Request');
  const task = {
    file,
    dir,
    id: meta.id || basename(file, '.md'),
    category: meta.category || basename(dir),
    check: meta.check,
    command: meta.command,
    rubric: meta.rubric === 'true' || meta.check === 'rubric',
    tools: list(meta.tools),
    files: list(meta.files),
    steps: Number(meta.steps || 8),
    title: (/^# (.+)$/m.exec(body) || [])[1] || basename(file),
    endpoint: meta.endpoint || 'chat',
    images: list(meta.images),
    audio: meta.audio || '',
    // Word error rate ceiling for the wer checks: 15% by default, a speech task may set its own.
    maxWer: Number(meta.max_wer || 0.15),
    prompt: section(body, 'Prompt'),
    expected: section(body, 'Expected'),
    requestText,
    request: parseRequest(requestText),
  };
  return task;
}

// The "## Request" json, or null when it is missing or does not parse: taskProblems reports either.
function parseRequest(text) {
  const [j] = blocks(text, 'json');
  if (!j) return null;
  try { return JSON.parse(j); } catch { return null; }
}

// Problems that would make a run meaningless: caught by --dry-run before any money is spent.
export function taskProblems(t) {
  const p = [];
  if (!t.prompt) p.push('no "## Prompt" section');
  if (!CHECKS.includes(t.check)) p.push(`check must be one of ${CHECKS.join(', ')}`);
  // A round trip is judged against the prompt itself, so it needs no answer key of its own.
  if (t.check !== 'rubric' && t.check !== 'wer-roundtrip' && !t.expected) p.push('no "## Expected" section');
  if (t.check === 'wer' && !blocks(t.expected, 'text').length) p.push('Expected needs a ```text block with the reference transcript');
  if (t.check === 'wer-roundtrip') {
    if (t.endpoint !== 'speech') p.push('wer-roundtrip needs endpoint: speech (its artifact is the audio)');
    if (!(t.maxWer >= 0 && t.maxWer <= 1)) p.push('max_wer must be a number between 0 and 1');
  }
  if (t.check === 'vision-judge') {
    if (!['images', 'videos'].includes(t.endpoint)) p.push('vision-judge needs endpoint: images or videos');
    const [j] = blocks(t.expected, 'json');
    let qs = null;
    try { qs = JSON.parse(j); } catch { /* reported below */ }
    if (!Array.isArray(qs) || !qs.length || !qs.every((x) => typeof x?.q === 'string' && typeof x?.a === 'boolean')) {
      p.push('Expected needs a ```json array of { "q": string, "a": boolean }');
    }
  }
  if (t.check === 'command' && !(t.command && existsSync(join(t.dir, t.command)))) p.push(`check command file missing: ${t.command}`);
  if (t.check === 'json') {
    const [j] = blocks(t.expected, 'json');
    try { JSON.parse(j); } catch { p.push('Expected needs a valid ```json block'); }
  }
  if (t.check === 'regex' && !blocks(t.expected, 'regex').length) p.push('Expected needs a ```regex block');
  if (t.rubric && !/rubric/i.test(t.expected)) p.push('rubric task: list its rubric points under "## Expected"');
  for (const f of t.files) if (!existsSync(join(t.dir, f))) p.push(`fixture missing: ${f}`);
  if (t.files.length && !t.tools.includes('read_file')) p.push('fixtures need tools: read_file');
  if (!ENDPOINTS.includes(t.endpoint)) p.push(`endpoint must be one of ${ENDPOINTS.join(', ')}`);
  const needs = REQUEST_KEYS[t.endpoint];
  if (needs) {
    if (!t.request) p.push(`${t.endpoint} needs a valid \`\`\`json block under "## Request"`);
    else for (const k of needs) if (!(k in t.request)) p.push(`Request needs "${k}" for ${t.endpoint}`);
  }
  // Fixtures are checked here so a missing image costs nothing: the run would send a broken request.
  for (const img of t.images) {
    if (!existsSync(join(t.dir, img))) p.push(`images fixture missing: ${img}`);
    else if (!mimeOf(img)) p.push(`images fixture must be png, jpg, webp or gif: ${img}`);
  }
  if (t.images.length && t.endpoint !== 'chat') p.push('images: is only read by the chat endpoint');
  if (t.audio && !existsSync(join(t.dir, t.audio))) p.push(`audio fixture missing: ${t.audio}`);
  // The answer key must never reach the model, neither in the prompt nor in the request body.
  if (t.expected && t.prompt.includes(t.expected.slice(0, 40))) p.push('the prompt contains the expected answer');
  if (t.expected && t.requestText && t.requestText.includes(t.expected.slice(0, 40))) p.push('the Request block contains the expected answer');
  return p;
}

export function loadTasks(path) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((f) => join(path, f))
    : [path];
  return files.map(loadTask);
}
