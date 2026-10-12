// Dev-squad runner for non-Claude models through OpenRouter (session tooling, kept in the repo, #113).
// node tools/squad/run.mjs --model <id> --role <coder|reviewer|security> --node <tower node> --task <file> [--steps 40] [--repo <path>]
// The key is loaded from the user's key file into this process only; it is never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { env, argv, exit, loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
// A missing --task used to reach readFileSync and fail with a raw fs error: a usage line is the answer.
const USAGE = 'usage: node tools/squad/run.mjs --model <id> --role <coder|reviewer|security> --node <tower node> --task <file> [--steps 40] [--write a,b] [--repo <path>]';
if (argv.includes('--help')) { console.log(USAGE); exit(0); }
const taskFile = arg('task');
// Checked before any git call, so a bare invocation fails on the usage, not on the checkout.
if (!taskFile || !existsSync(taskFile)) { console.error(USAGE); exit(1); }
// --repo runs the squad in another worktree, so two tasks never share a checkout; without it, the checkout
// the command is run from.
const REPO = resolve(arg('repo') ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
// The live-events helper is a sibling of this script, so a checkout carries its own copy, wherever it sits.
const EV = join(HERE, 'ev.sh');
const model = arg('model'), role = arg('role'), node = arg('node'), task = readFileSync(taskFile, 'utf8');
const maxSteps = Number(arg('steps', 40));
const DOT = '.' + 'env';
// The key file is the one the voice feature reads (src/server/plugin.ts): ~/.config/flow-tower/.env, or
// FLOW_TOWER_HOME. The git-ignored .env of the checkout is the fallback. Real environment variables win.
// A worktree has no copy of that ignored file: the main checkout (parent of the shared .git) is tried last.
const USER_ENV = join(env.FLOW_TOWER_HOME ?? join(homedir(), '.config', 'flow-tower'), DOT);
const MAIN = dirname(resolve(REPO, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim()));
for (const f of [USER_ENV, join(REPO, DOT), join(MAIN, DOT)]) {
  if (!env.OPENROUTER_API_KEY && existsSync(f)) loadEnvFile(f);
}
if (!env.OPENROUTER_API_KEY) { console.error(`no key: put OPENROUTER_API_KEY in ${USER_ENV} or in the git-ignored .env of ${REPO}, or export it`); exit(1); }

const log = join(HERE, `${role}-${Date.now()}.log`);
const note = (s) => appendFileSync(log, `${s}\n`);
// Run through sh so the helper needs no executable bit, and drop undefined arguments (a missing --node).
const emit = (...a) => { try { execFileSync('sh', [EV, ...a.filter((x) => x !== undefined).map(String)], { stdio: 'ignore' }); } catch { /* tower offline */ } };

const SECRET = /(^|\/)(\.env[^/]*|.*\.(key|pem|p12|pfx|crt)|id_rsa[^/]*|\.npmrc|\.git|node_modules|\.ssh|\.config\/flow-tower)(\/|$)/i;
// Reviewers are read-only; the coder writes src/ tests/ e2e/, or the folders a task names with --write a,b.
const dirs = arg('write', 'src,tests,e2e').split(',').map((d) => d.replace(/[^\w.-]/g, '')).filter(Boolean);
const WRITABLE = role === 'coder' ? new RegExp(`^(${dirs.map((d) => d.replace(/[.]/g, "\\.")).join("|")})(/|$)`) : /^$/;
const SCRATCH = /(^|\/)(tmp[-_.]|zz[-_]|[^/]*(probe|scratch)[^/]*$)/i;
const inRepo = (p) => {
  const abs = resolve(REPO, String(p ?? ''));
  const rel = relative(REPO, abs);
  if (!rel || rel.startsWith('..') || SECRET.test(rel)) throw new Error(`path not allowed: ${p}`);
  return { abs, rel };
};
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 20e6 });
const cap = (s, n = 40_000) => (s.length > n ? `${s.slice(0, n)}\n…[cut ${s.length - n} chars]` : s);
const sh = (cmd, a) => {
  try { return cap(execFileSync(cmd, a, { cwd: REPO, encoding: 'utf8', maxBuffer: 50e6, timeout: 600_000, stdio: ['ignore', 'pipe', 'pipe'] }), 20_000); }
  catch (e) { return cap(`EXIT ${e.status}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`, 20_000); }
};

const RUNS = {
  check: () => sh('npm', ['run', 'check']),
  typecheck: () => sh('npm', ['run', 'typecheck']),
  vitest: (f) => sh('npx', ['vitest', 'run', inRepo(f).rel]),
  // The dirs a task may touch (--write) are the ones worth reviewing: a reviewer of tools/ would see nothing otherwise.
  diff: () => cap(git('diff', 'origin/main', '--', ...dirs)),
  status: () => git('status', '--short'),
  validate: (f) => sh('node', ['bin/flow-tower.js', 'validate', f ? inRepo(f).rel : 'examples', '--json']),
  // An example script in dry-run mode (the coder could not verify scripts/*.mjs otherwise, #75). The key is
  // removed from the child environment, so nothing paid can run whatever the script does.
  dryrun: (f) => {
    const { rel } = inRepo(f);
    if (!/^examples\/[^/]+\/scripts\/[^/]+\.mjs$/.test(rel)) throw new Error('dryrun: file must be examples/<name>/scripts/<script>.mjs');
    const { OPENROUTER_API_KEY: _drop, ...childEnv } = env;
    // The output file goes to the system temp folder: the repo must not collect run leftovers.
    const out = join(tmpdir(), `flow-tower-dryrun-${process.pid}.md`);
    try { return cap(execFileSync('node', [rel, '--dry-run', '--out', out], { cwd: REPO, env: childEnv, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }), 20_000); }
    catch (e) { return cap(`EXIT ${e.status}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`, 20_000); }
  },
};
const tools = {
  list_files: ({ dir = '.' }) => cap(git('ls-files', '--', inRepo(dir === '.' ? 'src' : dir).rel)),
  read_file: ({ path, from = 1, to = 2000 }) => {
    const { abs } = inRepo(path);
    const lines = readFileSync(abs, 'utf8').split('\n');
    return cap(lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join('\n'));
  },
  grep: ({ pattern, path = '.' }) => { try { return cap(git('grep', '-n', '-I', '-E', String(pattern), '--', path === '.' ? '.' : inRepo(path).rel), 15_000); } catch { return 'no match'; } },
  edit_file: ({ path, old, new: next }) => {
    const { abs, rel } = inRepo(path);
    if (!WRITABLE.test(rel)) throw new Error(`read-only for ${role}: ${rel}`);
    const text = readFileSync(abs, 'utf8');
    const n = text.split(old).length - 1;
    if (n !== 1) throw new Error(`old text found ${n} times: it must match exactly once`);
    writeFileSync(abs, text.replace(old, () => next));
    return `edited ${rel}`;
  },
  write_file: ({ path, content }) => {
    const { abs, rel } = inRepo(path);
    if (!WRITABLE.test(rel)) throw new Error(`read-only for ${role}: ${rel}`);
    // The coder kept leaving probe files despite the prompt (#75 finding 8): refuse them at the tool.
    if (SCRATCH.test(rel)) throw new Error(`probe/scratch files are not allowed in the repo: ${rel}. Use run vitest on a real test file, or reason from the code.`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return `wrote ${rel}`;
  },
  // Without a delete tool the coder replaced a file it was told to remove with an empty placeholder (#75).
  delete_file: ({ path }) => {
    const { abs, rel } = inRepo(path);
    if (!WRITABLE.test(rel)) throw new Error(`read-only for ${role}: ${rel}`);
    if (!existsSync(abs)) return `not there: ${rel}`;
    rmSync(abs);
    return `deleted ${rel}`;
  },
  run: ({ command, file }) => { const f = RUNS[command]; if (!f) throw new Error(`commands: ${Object.keys(RUNS).join(', ')}`); return f(file); },
};
const fn = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const S = { type: 'string' };
const TOOLS = [
  fn('list_files', 'Tracked files under a folder.', { dir: S }),
  fn('read_file', 'Read a repo file with line numbers (optionally a line range).', { path: S, from: { type: 'integer' }, to: { type: 'integer' } }, ['path']),
  fn('grep', 'git grep -n -E over tracked files.', { pattern: S, path: S }, ['pattern']),
  ...(role === 'coder' ? [
    fn('edit_file', `Replace one exact, unique occurrence of \`old\` with \`new\` (${dirs.join('/, ')}/ only).`, { path: S, old: S, new: S }, ['path', 'old', 'new']),
    fn('write_file', `Create or overwrite a file (${dirs.join('/, ')}/ only).`, { path: S, content: S }, ['path', 'content']),
    fn('delete_file', 'Delete a file you may write (e.g. one the task says to remove).', { path: S }, ['path']),
  ] : []),
  fn('run', 'Run a whitelisted command: check (typecheck + all tests), typecheck, vitest (with file), diff (vs origin/main), status, validate, dryrun (file: examples/<name>/scripts/<script>.mjs, runs it with --dry-run and no API key).', { command: { type: 'string', enum: Object.keys(RUNS) }, file: S }, ['command']),
  fn('finish', 'End with your final report (the format your task asks for).', { report: S }, ['report']),
];

// Prompt caching is opt-in per request and only Claude models honour it here: cache reads cost 0.1x, writes 1.25x.
const cacheControl = (id) => (id.startsWith('anthropic/') ? { cache_control: { type: 'ephemeral' } } : {});

const messages = [
  { role: 'system', content: `You are the ${role} of a dev squad working on the repo Flow Tower (TypeScript, React 19, Vite 8, vitest) at ${REPO}. You work only through the tools. English only in code and comments; match the surrounding style; comments explain why; files under ~400 lines. Never touch secret files. When done, call finish with your report.` },
  { role: 'user', content: task },
];
let cost = 0;
let promptTokens = 0, cachedTokens = 0;
// One session per run: OpenRouter keeps it on the provider that holds its prompt cache (cached input: DeepSeek 0.1x, Z.ai ~0.2x).
const session = `${role}-${Date.now()}`;
emit('agent.start', node, `${role} on ${model}`);
note(`# ${role} ${model}\n${task}\n`);
for (let step = 0; step < maxSteps; step++) {
  // A call stuck for minutes (GLM once sat 7 min on one) is retried once, then the run stops.
  const ask = () => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower dev-squad' },
    body: JSON.stringify({ model, messages, tools: TOOLS, max_tokens: 16000, usage: { include: true }, session_id: session,
      // OpenRouter caches Claude prompts only on request; the breakpoint trails the last cacheable block (https://openrouter.ai/docs/guides/best-practices/prompt-caching).
      ...cacheControl(model),
      // Low effort everywhere (maintainer, 2026-10-10): quick passes, the review rounds re-check the work.
      reasoning: { effort: 'low' }, provider: { require_parameters: true, data_collection: 'deny' } }),
    signal: AbortSignal.timeout(180_000),
  });
  let r;
  try { r = await ask(); } catch { emit('log', node, `step ${step + 1}: no answer in 3 min, retrying`, 'error'); r = await ask(); }
  if (!r.ok) { const t = await r.text(); note(`HTTP ${r.status} ${t}`); console.log(`HTTP ${r.status} ${t.slice(0, 400)}`); exit(1); }
  const out = await r.json();
  cost += out.usage?.cost ?? 0;
  promptTokens += out.usage?.prompt_tokens ?? 0;
  cachedTokens += out.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const cached = promptTokens ? Math.round((100 * cachedTokens) / promptTokens) : 0;
  const msg = out.choices?.[0]?.message ?? {};
  messages.push({ role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls?.length && { tool_calls: msg.tool_calls }) });
  if (msg.content) note(`\n[assistant] ${msg.content}`);
  emit('log', node, `step ${step + 1} · $${cost.toFixed(3)} · cache ${cached}%${msg.content ? ` · ${msg.content.replace(/\s+/g, ' ').slice(0, 80)}` : ''}`);
  if (!msg.tool_calls?.length) { messages.push({ role: 'user', content: 'Use the tools; call finish with your report when done.' }); continue; }
  for (const c of msg.tool_calls) {
    let a = {};
    try { a = JSON.parse(c.function.arguments || '{}'); } catch { /* reported below */ }
    if (c.function.name === 'finish') {
      note(`\n[finish] ${a.report}\n\ncost $${cost.toFixed(4)}`);
      emit('agent.end', node, `${role} on ${model} done ($${cost.toFixed(3)}, cache ${cached}%)`, 'ok');
      console.log(`${a.report}\n\n--- ${model} · ${step + 1} steps · $${cost.toFixed(4)} · cache ${cached}% of ${promptTokens} prompt tokens · log ${log}`);
      exit(0);
    }
    let result;
    try { result = String(tools[c.function.name]?.(a) ?? `unknown tool ${c.function.name}`); } catch (e) { result = `ERROR: ${e.message}`; }
    note(`\n[${c.function.name}] ${JSON.stringify(a).slice(0, 300)}\n→ ${result.slice(0, 600)}`);
    // Every call shows on the tower, reads included: a reviewer only reads, and must not look idle.
    const what = a.path ?? a.command ?? a.pattern ?? a.dir ?? '';
    emit('log', node, `${c.function.name} ${what}${result.startsWith('ERROR') ? ' ✗' : ''}`.slice(0, 120), result.startsWith('ERROR') || result.startsWith('EXIT') ? 'error' : 'ok');
    messages.push({ role: 'tool', tool_call_id: c.id, content: result });
  }
}
emit('agent.end', node, `${role} on ${model}: step cap`, 'error');
console.log(`step cap reached · $${cost.toFixed(4)} · log ${log}`);
