// Task files: shared by bench.mjs (what to send) and judge.mjs (how to check).
// A task is Markdown with a small front matter and two sections:
//   ## Prompt   sent to the model, nothing else is
//   ## Expected never sent: the answer key, written before the first run
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const CHECKS = ['command', 'json', 'regex', 'rubric'];

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
    prompt: section(body, 'Prompt'),
    expected: section(body, 'Expected'),
  };
  return task;
}

// Problems that would make a run meaningless: caught by --dry-run before any money is spent.
export function taskProblems(t) {
  const p = [];
  if (!t.prompt) p.push('no "## Prompt" section');
  if (!CHECKS.includes(t.check)) p.push(`check must be one of ${CHECKS.join(', ')}`);
  if (t.check !== 'rubric' && !t.expected) p.push('no "## Expected" section');
  if (t.check === 'command' && !(t.command && existsSync(join(t.dir, t.command)))) p.push(`check command file missing: ${t.command}`);
  if (t.check === 'json') {
    const [j] = blocks(t.expected, 'json');
    try { JSON.parse(j); } catch { p.push('Expected needs a valid ```json block'); }
  }
  if (t.check === 'regex' && !blocks(t.expected, 'regex').length) p.push('Expected needs a ```regex block');
  if (t.rubric && !/rubric/i.test(t.expected)) p.push('rubric task: list its rubric points under "## Expected"');
  for (const f of t.files) if (!existsSync(join(t.dir, f))) p.push(`fixture missing: ${f}`);
  if (t.files.length && !t.tools.includes('read_file')) p.push('fixtures need tools: read_file');
  // The answer key must never reach the model.
  if (t.expected && t.prompt.includes(t.expected.slice(0, 40))) p.push('the prompt contains the expected answer');
  return p;
}

export function loadTasks(path) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((f) => join(path, f))
    : [path];
  return files.map(loadTask);
}
