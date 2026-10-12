// Dev-squad runner for non-Claude models through OpenRouter (session tooling, kept in the repo, #113).
// node tools/squad/run.mjs --model <id> --role <coder|reviewer|security> --node <tower node> --task <file> [--steps 40] [--issue <n>] [--repo <path>] [--oneshot|--batch]
// --oneshot and --batch (reviewer and security only) answer in one request with no tools (oneshot.mjs, #169).
// The key is loaded from the user's key file into this process only; it is never printed.
// Each run ends with one line in the local cost ledger (ledger.mjs, #156), finished or failed alike.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { env, argv, exit, loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { appendRun, issueOf, ledgerPath } from './ledger.mjs';
import { BATCH_NOTE, batchOne, chatUrl, deleteBatch, generationCost } from './batch.mjs';
import { realRelIfAllowed, realTarget } from './guard.mjs';
import { ONESHOT_TIMEOUT_MS, cacheControl, oneshotBody, oneshotSystem } from './oneshot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
// A missing --task used to reach readFileSync and fail with a raw fs error: a usage line is the answer.
const USAGE = 'usage: node tools/squad/run.mjs --model <id> --role <coder|reviewer|security> --node <tower node> --task <file> [--steps 40] [--issue <n>] [--write a,b] [--repo <path>] [--oneshot | --batch]';
if (argv.includes('--help')) { console.log(USAGE); exit(0); }
const taskFile = arg('task');
// Checked before any git call, so a bare invocation fails on the usage, not on the checkout.
if (!taskFile || !existsSync(taskFile)) { console.error(USAGE); exit(1); }
// --repo runs the squad in another worktree, so two tasks never share a checkout; without it, the checkout
// the command is run from.
const REPO = resolve(arg('repo') ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
// The live-events helper is a sibling of this script, so a checkout carries its own copy, wherever it sits.
const EV = join(HERE, 'ev.sh');
// The issue is taken from --issue, else from the branch name; a detached or unreadable HEAD gives no branch.
const branch = (() => { try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return ''; } })();
const issue = issueOf(arg('issue'), branch);
const model = arg('model'), role = arg('role'), node = arg('node'), task = readFileSync(taskFile, 'utf8');
const maxSteps = Number(arg('steps', 40));
// Modes (#169): the tool loop stays the default; reviewer and security can answer in one request instead. SQUAD_PACE
// sets their default: relaxed is one direct request (a daytime review in minutes), overnight is a batch (half the price,
// hours of wait, for work left running overnight). An explicit flag wins over the pace. The coder always needs its tools.
// The role names the log file below, so only the three known roles pass (no path characters from the command line).
if (!['coder', 'reviewer', 'security'].includes(role)) { console.error(USAGE); exit(1); }
const flagOneshot = argv.includes('--oneshot'), flagBatch = argv.includes('--batch');
const oneshotRole = role === 'reviewer' || role === 'security';
if ((flagOneshot || flagBatch) && !oneshotRole) {
  console.error(role === 'coder' ? 'the coder needs tools: --oneshot/--batch are for reviewer and security' : USAGE);
  exit(1);
}
if (flagOneshot && flagBatch) { console.error('--oneshot and --batch are exclusive'); exit(1); }
// An unknown pace is refused rather than read as now: a typo must not silently pick the paid mode.
const PACE = env.SQUAD_PACE;
if (PACE !== undefined && !['now', 'relaxed', 'overnight'].includes(PACE)) { console.error('SQUAD_PACE must be now, relaxed or overnight'); exit(1); }
const paceMode = PACE === 'relaxed' ? 'oneshot' : PACE === 'overnight' ? 'batch' : undefined;
const fromPace = !flagOneshot && !flagBatch && oneshotRole ? paceMode : undefined;
const mode = flagBatch ? 'batch' : flagOneshot ? 'oneshot' : fromPace ?? 'loop';
// The mode that was paid for: a batch that has no endpoint for the model falls back to oneshot, and the ledger says so.
let paidMode = mode;
console.log(`mode: ${mode}${fromPace ? ` (SQUAD_PACE=${PACE})` : ''}`);
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
// Every write is checked on its real path, so a symlink inside the repo cannot lead the write out of it (#169 review).
// Returns the real path to write to; the role's writable folders and the secret patterns still apply.
const writable = (abs, rel) => {
  if (!WRITABLE.test(rel)) throw new Error(`read-only for ${role}: ${rel}`);
  const real = realRelIfAllowed({ repo: REPO, abs, secret: SECRET, writable: WRITABLE });
  if (real === null) throw new Error(`write outside the repo or through a link: ${rel}`);
  return realTarget(abs);
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
  // A write goes where its real path (symlinks followed) says, so that path is what is checked (guard.mjs).
  edit_file: ({ path, old, new: next }) => {
    const { abs, rel } = inRepo(path);
    const real = writable(abs, rel);
    const text = readFileSync(real, 'utf8');
    const n = text.split(old).length - 1;
    if (n !== 1) throw new Error(`old text found ${n} times: it must match exactly once`);
    writeFileSync(real, text.replace(old, () => next));
    return `edited ${rel}`;
  },
  write_file: ({ path, content }) => {
    const { abs, rel } = inRepo(path);
    // The coder kept leaving probe files despite the prompt (#75 finding 8): refuse them at the tool.
    if (SCRATCH.test(rel)) throw new Error(`probe/scratch files are not allowed in the repo: ${rel}. Use run vitest on a real test file, or reason from the code.`);
    const real = writable(abs, rel);
    mkdirSync(dirname(real), { recursive: true });
    writeFileSync(real, content);
    return `wrote ${rel}`;
  },
  // Without a delete tool the coder replaced a file it was told to remove with an empty placeholder (#75).
  delete_file: ({ path }) => {
    const { abs, rel } = inRepo(path);
    const real = writable(abs, rel);
    if (!existsSync(real)) return `not there: ${rel}`;
    rmSync(real);
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

const messages = [
  { role: 'system', content: `You are the ${role} of a dev squad working on the repo Flow Tower (TypeScript, React 19, Vite 8, vitest) at ${REPO}. You work only through the tools. English only in code and comments; match the surrounding style; comments explain why; files under ~400 lines. Never touch secret files. When done, call finish with your report.` },
  { role: 'user', content: task },
];
let cost = 0;
// Set when a batch answer's cost could not be read: the ledger then gets null and costUnknown, not a false 0.
let costUnknown = false;
let promptTokens = 0, cachedTokens = 0;
// A failed run still cost money, so every exit writes its line; steps counts the model calls that completed.
let recorded = false, stepsDone = 0;
const record = (outcome, steps) => {
  recorded = true;
  appendRun(ledgerPath(env), { ts: new Date().toISOString(), issue, role, model, steps, cost: costUnknown ? null : Number(cost.toFixed(6)), ...(costUnknown && { costUnknown: true }), promptTokens, cachedTokens, outcome, mode: paidMode });
};
// An unhandled throw (two failed fetches, a bad JSON body) ends the process without any explicit record: the exit
// handler catches those. appendFileSync is synchronous, so the write completes inside the handler.
process.on('exit', () => { if (!recorded) record('crash', stepsDone); });
// A default-handled SIGINT or SIGTERM kills the process without emitting 'exit', so a run stopped with Ctrl-C
// (the usual answer to a stuck model call) left no ledger line. Listening here records it; exit() then sets the code.
// A pending batch is deleted first: exit() skips batchOne's finally, and a batch is kept 30 days otherwise.
// The DELETE is bounded to 5 s so a dead network cannot hold the interrupt forever.
let pendingBatch;
const onInterrupt = async (code) => {
  if (pendingBatch) {
    const id = pendingBatch;
    pendingBatch = undefined;
    const gone = await deleteBatch(env.OPENROUTER_API_KEY, id, AbortSignal.timeout(5_000));
    console.log(gone ? `squad batch ${id}: deleted on interrupt` : `squad batch ${id}: not deleted on interrupt, delete it by hand`);
  }
  if (!recorded) record('interrupted', stepsDone);
  exit(code);
};
process.on('SIGINT', () => { onInterrupt(130); });
process.on('SIGTERM', () => { onInterrupt(143); });
// A failed HTTP answer is logged as its status and a short error code only: the provider's body can echo the
// request, and the log and the console must not carry that. The body is read here, for the code, and dropped.
async function httpFailure(r) {
  const j = await r.json().catch(() => null);
  const code = j?.error?.code;
  const short = typeof code === 'string' || typeof code === 'number' ? String(code) : '';
  return `HTTP ${r.status}${/^[\w.-]{1,40}$/.test(short) ? ` ${short}` : ''}`;
}
// One request with no tools, shared by --oneshot and by a batch that fell back. No retry on the 10 min cap:
// one long answer, the failure is the answer.
async function oneshotCall(body) {
  const r = await fetch(chatUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Flow Tower dev-squad' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ONESHOT_TIMEOUT_MS),
  });
  if (!r.ok) { const f = await httpFailure(r); note(f); record('http-error', 0); console.log(f); exit(1); }
  const out = await r.json();
  return { content: out.choices?.[0]?.message?.content, usage: out.usage ?? {} };
}
// One session per run: OpenRouter keeps it on the provider that holds its prompt cache (cached input: DeepSeek 0.1x, Z.ai ~0.2x).
const session = `${role}-${Date.now()}`;
emit('agent.start', node, `${role} on ${model}`);
note(`# ${role} ${model}\n${task}\n`);
// One request (or one batch) with the task as the whole input: no tool loop, one step, then exit.
if (mode !== 'loop') {
  const body = oneshotBody({ model, system: oneshotSystem(role, REPO), task, session });
  let answer;
  if (mode === 'oneshot') answer = await oneshotCall(body);
  else {
    // The batch is slower but about half the price; BATCH_NOTE says where the inputs stay meanwhile.
    console.log(BATCH_NOTE);
    const progress = (line) => { console.log(line); emit('log', node, line.slice(0, 120)); };
    const res = await batchOne({ key: env.OPENROUTER_API_KEY, body, log: progress, onCreated: (id) => { pendingBatch = id; } });
    pendingBatch = undefined;
    if (res.noBatch) {
      // Not every model has a batch endpoint: the review still runs, at full price, and the ledger says so.
      console.log(`${model} has no batch endpoint: falling back to --oneshot (full price)`);
      paidMode = 'oneshot';
      answer = await oneshotCall(body);
    } else {
      if (!res.ok) { note(`batch error ${res.error}`); record('batch-error', 0); console.log(`batch failed: ${res.error}`); exit(1); }
      answer = { content: res.content, usage: res.usage, generationId: res.generationId };
    }
  }
  const { content, usage } = answer;
  if (typeof content !== 'string' || content === '') { note('empty answer'); record('empty-answer', 0); console.log('empty answer'); exit(1); }
  stepsDone = 1;
  // A batch result has no usage.cost: it is read from the generation endpoint. Still unknown is null, never a false 0.
  let callCost = usage.cost;
  if (typeof callCost !== 'number' && answer.generationId) {
    callCost = await generationCost({ key: env.OPENROUTER_API_KEY, id: answer.generationId, log: (l) => note(l) });
  }
  costUnknown = typeof callCost !== 'number';
  if (!costUnknown) cost += callCost;
  promptTokens += usage.prompt_tokens ?? 0;
  cachedTokens += usage.prompt_tokens_details?.cached_tokens ?? 0;
  const cached = promptTokens ? Math.round((100 * cachedTokens) / promptTokens) : 0;
  const shown = costUnknown ? 'cost unknown' : `$${cost.toFixed(4)}`;
  note(`\n[finish] ${content}\n\ncost ${shown}`);
  record('finish', 1);
  emit('agent.end', node, `${role} on ${model} done (${shown}, ${paidMode})`, 'ok');
  console.log(`${content}\n\n--- ${model} · 1 step · ${shown} · cache ${cached}% of ${promptTokens} prompt tokens${paidMode === 'batch' ? ' (batch)' : ''} · log ${log}`);
  exit(0);
}
for (let step = 0; step < maxSteps; step++) {
  // A call stuck for minutes (GLM once sat 7 min on one) is retried once, then the run stops.
  const ask = () => fetch(chatUrl(), {
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
  if (!r.ok) { const f = await httpFailure(r); note(f); record('http-error', step); console.log(f); exit(1); }
  const out = await r.json();
  stepsDone++;
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
      record('finish', step + 1);
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
record('step-cap', maxSteps);
emit('agent.end', node, `${role} on ${model}: step cap`, 'error');
console.log(`step cap reached · $${cost.toFixed(4)} · log ${log}`);
