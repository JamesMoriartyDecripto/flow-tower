#!/usr/bin/env node
// Dev-squad smoke driver (#105): runs the real squad runner (tools/squad/run.mjs) on synthetic tasks, one child
// process per role, task, model and repetition, in an isolated temporary repository copied from a fixture template.
//
//   node scripts/squad-pilot.mjs                          dry run: counts, task checks, upper call estimate; no model, no key
//   node scripts/squad-pilot.mjs --execute --out <dir> --budget 1 [--runs 1] [--roles a,b] [--models x/y,z/w]
//
// --execute spends money. It stops on unknown cost, rate limits or admission holds, on spend at or past 85% of --budget,
// and on any unexpected child error (recorded first). A step-cap is recorded and the pilot goes on. Every finished run
// is appended to runs.jsonl at once, with its stdout, stderr and raw ledger line kept beside it; a resume skips the runs
// already there, and refuses to continue past rate-limit records unless the out folder is new.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadTasks, taskProblems } from './tasks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The checkout the runner belongs to: the driver never copies run.mjs, it invokes the absolute script with --repo.
const CHECKOUT = resolve(HERE, '..', '..', '..');
const RUNNER = join(CHECKOUT, 'tools', 'squad', 'run.mjs');
const GATE = join(CHECKOUT, 'tools', 'squad', 'gate.mjs');
const DEFAULT_TASKS = join(HERE, '..', 'tasks', 'squad-pilot');
// Fixture repositories each run starts from; the case picks one (see caseFor). Their contents are not created here.
export const TEMPLATES = join(HERE, '..', 'tasks', 'squad-pilot', 'templates');
const ISSUE = '105';
const COOLDOWN_MS = 1000;
// The 85% stop threshold: a run in flight can overshoot, so the stop is taken before the budget, not at it.
const STOP_SHARE = 0.85;
// A child that prints one of these is throttled or held by the provider: the pilot stops instead of retrying.
const HOLD = /HTTP 429|admission|bili_throttle_hold/i;
// The models of the plan's shorthand (dev-squad-plan.md, "Candidate shorthand").
const MODEL = {
  H: 'anthropic/claude-haiku-5.5', G: 'z-ai/glm-5.3-flash', D: 'deepseek/deepseek-v4.1-flash', L: 'openai/gpt-6-luna',
  M: 'xiaomi/mimo-v2.6-flash', N: 'minimax/minimax-m3.1-flash', Q: 'qwen/qwen3.8-flash', F: 'google/gemini-3.8-flash',
};
// The 29 role/model combinations of the proposed matrix, copied from dev-squad-plan.md.
export const MATRIX = {
  triage: 'HGL', architect: 'GHLF', researcher: 'GDN', coder: 'HLMQ', tester: 'HGL',
  reviewer: 'GDF', security: 'DGF', verifier: 'GHL', 'doc-writer': 'HGM',
};
const WRITE = { 'doc-writer': 'docs' };
const WRITE_DEFAULT = 'src';
const TEST_DIR = 'tests';

// Which fixture repository a task starts from. Tasks ending in "-b" run on the bug repo case-b; tester and verifier
// "-b" tasks run on case-b-clean, the same repo with no planted defect. Clean task ids never end in "-b". Every other
// task (and the inline reviewer and security examples) starts from case-a.
export function caseFor(role, taskId) {
  if (!/-b$/.test(taskId)) return 'case-a';
  return role === 'tester' || role === 'verifier' ? 'case-b-clean' : 'case-b';
}

// The run key used for resume: one line per role, task, model and repetition.
export const runKey = (r) => `${r.role}\u0000${r.task}\u0000${r.model}\u0000${r.run}`;

// The shared map as a flat list of { role, model } pairs, filtered by --roles and --models when given.
export function combos({ roles, models } = {}) {
  const out = [];
  for (const [role, letters] of Object.entries(MATRIX)) {
    if (roles && !roles.includes(role)) continue;
    for (const letter of letters) {
      const model = MODEL[letter];
      if (models && !models.includes(model)) continue;
      out.push({ role, model });
    }
  }
  return out;
}

// The gate's parser (gate.mjs exports parseVerdict). A task id ending in "clean" is a negative control: it must be
// approved with no findings. Every other task plants a defect: the verdict must be "changes" and quote a finding.
export function verdictOk(taskId, text, parseVerdict) {
  let parsed;
  try { parsed = parseVerdict(text); } catch { return false; }
  if (/-b$/.test(taskId)) return parsed.verdict === 'approve' && parsed.findings.length === 0;
  return parsed.verdict === 'changes' && parsed.findings.length > 0;
}

// The gate's parser is a tools/ module with no shell, so importing it costs nothing paid.
let parseVerdictFn = null;
export async function loadVerdictParser() {
  return (await import(GATE)).parseVerdict;
}

// Outcome checks that do not need a human. The runner's ledger writes 'finish' for a completed run; 'step-cap' is a
// recorded failure and is not graded as a pass. Manual grading is never implied: each result says what is still pending.
export function checkOutcome({ role, taskId, ledger, text, changed, parseVerdict }) {
  const manualPending = role === 'reviewer' || role === 'security';
  if (ledger?.outcome !== 'finish') return { deterministicPass: false, manualPending, notes: [`outcome ${ledger?.outcome ?? 'missing'}`] };
  if (typeof ledger.cost !== 'number' || ledger.costUnknown) return { deterministicPass: false, manualPending, notes: ['cost unknown'] };
  if (role === 'reviewer' || role === 'security') {
    const ok = verdictOk(taskId, text, parseVerdict);
    return { deterministicPass: ok, manualPending: true, notes: ok ? [] : ['verdict does not match the expected outcome'] };
  }
  if (role === 'coder') {
    // Tests must be byte-identical; the independent node --test run is the gap noted in the report, not done here.
    const ok = !changed.tests;
    return { deterministicPass: ok, manualPending: true, notes: ok ? ['coder tests not run here: manual'] : ['tests modified'] };
  }
  if (role === 'doc-writer') {
    const ok = changed.docs && !changed.src && !changed.tests;
    return { deterministicPass: ok, manualPending: true, notes: ['factual accuracy needs manual review'] };
  }
  // tester and verifier must report what the evidence showed; the report is free text and is graded by hand.
  if (role === 'tester' || role === 'verifier') return { deterministicPass: true, manualPending: true, notes: ['verdict wording needs manual review'] };
  return { deterministicPass: true, manualPending: true, notes: ['manual scoring pending'] };
}

// SHA-256 over every file of one folder, in sorted order. Symlinks are skipped (lstat), so a link cannot pull in or
// hide content outside the folder.
export function hashTree(dir) {
  const h = createHash('sha256');
  if (!existsSync(dir)) return h.digest('hex');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else h.update(relative(dir, p)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

// Upper call estimate: each run may take up to its task's step cap of model calls.
export function upperCalls(plan) {
  return plan.reduce((n, p) => n + p.steps, 0);
}

// Reads the run's ledger line, the last one written for the isolated ledger file.
export function lastLedger(text) {
  const lines = String(text ?? '').split('\n').filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch { /* skip */ }
  }
  return null;
}

// Spend so far in this out folder. Resume reads it, so the budget counts what was paid before a stop.
export function spentSoFar(records) {
  return records.reduce((s, r) => s + (typeof r.cost === 'number' ? r.cost : 0), 0);
}

// At or past the threshold, not only above it: the stop is taken before the budget is reached.
export const overBudget = (spent, budget) => spent >= STOP_SHARE * budget;

// Copies a fixture repository into a new temp folder and makes it a git repo whose HEAD is a real commit of that
// content. The runner's runnerCommit is read from this HEAD, so it names the checkout the run actually used.
export function prepareRepo(caseName, work, { templates = TEMPLATES } = {}) {
  const src = join(templates, caseName);
  if (!existsSync(src)) throw new Error(`fixture template missing: ${caseName} (expected under ${templates})`);
  const repo = join(work, 'repo');
  cpSync(src, repo, { recursive: true, verbatimSymlinks: false, filter: (p) => !lstatSync(p).isSymbolicLink() });
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...env, GIT_AUTHOR_NAME: 'pilot', GIT_AUTHOR_EMAIL: 'pilot@example.invalid', GIT_COMMITTER_NAME: 'pilot', GIT_COMMITTER_EMAIL: 'pilot@example.invalid' } });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', `pilot base ${caseName}`);
  return { repo, commit: git('rev-parse', 'HEAD').trim() };
}

// Runs one case: a copied fixture repo, a child runner process, the change check, persisted outputs and the cleanup.
// stdout, stderr and the raw ledger line are written to outDir before the temp folder is removed.
function runCase({ role, model, task, run, outDir, templates, parseVerdict }) {
  const work = mkdtempSync(join(tmpdir(), `squad-pilot-${role}-`));
  const ledgerFile = join(work, 'ledger.jsonl');
  const taskFile = join(work, 'task.md');
  const started = Date.now();
  try {
    writeFileSync(taskFile, `${task.prompt}\n`);
    const { repo, commit } = prepareRepo(caseFor(role, task.id), work, { templates });
    const runnerCommit = execFileSync('git', ['-C', CHECKOUT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const before = { src: hashTree(join(repo, 'src')), tests: hashTree(join(repo, TEST_DIR)), docs: hashTree(join(repo, 'docs')) };
    // The key is inherited from the environment: the runner loads the user's key file itself, and no key is copied here.
    let stdout = '', stderr = '', status = 0, childError = null;
    try {
      stdout = execFileSync(process.execPath, [RUNNER, '--repo', repo, '--task', taskFile, '--role', role, '--model', model, '--steps', String(task.steps), '--issue', ISSUE, '--write', WRITE[role] ?? WRITE_DEFAULT], {
        encoding: 'utf8', maxBuffer: 50e6, timeout: 900_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, SQUAD_LEDGER: ledgerFile },
      });
    } catch (e) {
      // A runner exit code (a failed or capped run) is an outcome; anything without a status is a child error.
      if (typeof e.status !== 'number') childError = e.message;
      else { status = e.status; stdout = e.stdout ?? ''; stderr = e.stderr ?? ''; }
    }
    const after = { src: hashTree(join(repo, 'src')), tests: hashTree(join(repo, TEST_DIR)), docs: hashTree(join(repo, 'docs')) };
    const changed = { src: before.src !== after.src, tests: before.tests !== after.tests, docs: before.docs !== after.docs };
    let testsPassed = true;
    if (role === 'coder') {
      const { OPENROUTER_API_KEY, ...testEnv } = env;
      try {
        execFileSync(process.execPath, ['--test'], { cwd: repo, encoding: 'utf8', env: testEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) { testsPassed = e.status === 0; }
    }
    const rawLedger = existsSync(ledgerFile) ? readFileSync(ledgerFile, 'utf8') : '';
    const ledger = lastLedger(rawLedger);
    const throttled = HOLD.test(`${stdout}\n${stderr}`);
    const check = childError ? { deterministicPass: false, manualPending: false, notes: ['child error'] }
      : checkOutcome({ role, taskId: task.id, ledger, text: stdout, changed, parseVerdict });
    if (role === 'coder') check.deterministicPass &&= testsPassed && !changed.tests && !changed.docs;
    const snapshot = [];
    for (const dir of ['src', 'docs']) if (changed[dir]) snapshot.push(dir);
    if (changed.tests) snapshot.push(TEST_DIR);
    const result = {
      role, model, task: task.id, run, ts: new Date().toISOString(), wallMs: Date.now() - started, status,
      outcome: childError ? 'child-error' : (ledger?.outcome ?? 'missing'), cost: ledger?.cost ?? null,
      costUnknown: Boolean(ledger?.costUnknown ?? ledger?.cost == null),
      promptTokens: ledger?.promptTokens ?? 0, cachedTokens: ledger?.cachedTokens ?? 0, steps: ledger?.steps ?? 0,
      ...(role === 'coder' ? { testsPassed } : {}),
      runnerCommit, fixtureCommit: commit, changedDirs: snapshot, throttled, childError, ...check,
    };
    if (outDir) {
      const base = join(outDir, 'runs', `${role}-${task.id}-${model.replace(/\//g, '_')}-${run}`);
      mkdirSync(base, { recursive: true });
      writeFileSync(join(base, 'stdout.txt'), stdout);
      writeFileSync(join(base, 'stderr.txt'), stderr);
      writeFileSync(join(base, 'ledger.jsonl'), rawLedger);
      const logPath = stdout.match(/ · log (.+)$/m)?.[1];
      if (logPath && existsSync(logPath)) writeFileSync(join(base, 'runner.log'), readFileSync(logPath));
      for (const dir of snapshot) copyTree(join(repo, dir), join(base, 'snapshot', dir));
    }
    return { result, stdout };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Copies a folder, skipping anything that is not a plain file: symlinks and secret names never leave the temp repo.
function copyTree(from, to) {
  if (!existsSync(from)) return;
  for (const name of readdirSync(from)) {
    if (/(^|\/)(\.env|.*\.(key|pem|p12|pfx|crt)|id_rsa)/i.test(name)) continue;
    const p = join(from, name);
    const q = join(to, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) copyTree(p, q);
    else { mkdirSync(dirname(q), { recursive: true }); copyFileSync(p, q); }
  }
}

// The out folder must be a new or empty-ish folder outside the checkout, the task folder and the fixture templates.
export function outProblem(out) {
  const abs = resolve(out);
  const inside = (root) => abs === resolve(root) || abs.startsWith(resolve(root) + '/');
  if (inside(CHECKOUT)) return 'the out folder must be outside the checkout';
  if (inside(DEFAULT_TASKS) || inside(TEMPLATES)) return 'the out folder must not sit in the task or template folders';
  return null;
}

function parseArgs(list) {
  const get = (k) => { const i = list.indexOf(`--${k}`); return i >= 0 ? list[i + 1] : undefined; };
  const csv = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
  const budget = get('budget') === undefined ? undefined : Number(get('budget'));
  const runs = get('runs') === undefined ? 1 : Number(get('runs'));
  return {
    execute: list.includes('--execute'),
    out: get('out'),
    budget,
    runs,
    roles: csv(get('roles')),
    models: csv(get('models')),
    tasks: get('tasks') ?? DEFAULT_TASKS,
  };
}

// Every --roles and --models name must be known: a typo would otherwise pass an empty plan as a success.
export function unknownFilters({ roles, models }) {
  const knownModels = new Set(Object.values(MODEL));
  const bad = [];
  for (const r of roles ?? []) if (!(r in MATRIX)) bad.push(`role ${r}`);
  for (const m of models ?? []) if (!knownModels.has(m)) bad.push(`model ${m}`);
  return bad;
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (!Number.isInteger(opts.runs) || opts.runs < 1) { console.error('--runs must be a whole number of at least 1'); exit(2); }
  const bad = unknownFilters(opts);
  if (bad.length) { console.error(`unknown filter: ${bad.join(', ')}`); exit(2); }
  if (opts.execute) {
    if (!opts.out) { console.error('--execute needs --out <dir>'); exit(2); }
    const why = outProblem(opts.out);
    if (why) { console.error(`--execute: ${why}`); exit(2); }
    if (!(opts.budget > 0 && opts.budget <= 1)) { console.error('--execute needs --budget above 0 and at most 1 (USD)'); exit(2); }
  }
  let tasks;
  try { tasks = loadTasks(opts.tasks); } catch (e) { console.error(`cannot read tasks: ${e.message}`); exit(2); }
  const broken = tasks.flatMap((t) => taskProblems(t).map((p) => `${t.category}/${t.id}: ${p}`));
  for (const p of broken) console.log(`FAIL ${p}`);
  const plan = [];
  for (const c of combos({ roles: opts.roles, models: opts.models })) {
    for (const task of tasks.filter((t) => t.category === c.role)) {
      for (let run = 1; run <= opts.runs; run++) plan.push({ ...c, task: task.id, run, steps: task.steps, prompt: task.prompt });
    }
  }
  if (opts.roles && plan.length === 0) { console.error('the filters select no runs'); exit(2); }
  const pairs = new Set(plan.map((p) => `${p.role}/${p.model}`)).size;
  console.log(`matrix: ${pairs} role/model combinations, ${plan.length} runs, ${tasks.length} tasks checked, ${broken.length} problems`);
  console.log(`upper model calls: ${upperCalls(plan)} (each run capped at its task steps)`);
  if (!opts.execute) {
    console.log('dry run: no model call, no key read. Pass --execute --out <dir> --budget <usd> to spend.');
    exit(broken.length ? 1 : 0);
  }
  if (broken.length) { console.error('refusing to execute with task problems'); exit(1); }
  const parseVerdict = await loadVerdictParser();
  mkdirSync(opts.out, { recursive: true });
  const file = join(opts.out, 'runs.jsonl');
  const records = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  // A resume past a rate-limit or hold record is refused: the provider said stop, so a new out folder is the explicit choice.
  if (records.some((r) => typeof r.cost !== 'number' || !Number.isFinite(r.cost))) { console.error(`stop: ${file} has unknown or nonfinite cost; use a new --out folder`); exit(3); }
  if (records.some((r) => r.throttled)) { console.error(`stop: ${file} has a provider hold record; use a new --out folder`); exit(3); }
  const done = new Set(records.map(runKey));
  let spent = spentSoFar(records);
  for (const p of plan) {
    if (done.has(runKey(p))) continue;
    if (overBudget(spent, opts.budget)) { console.error(`stop: spend ${spent} at or past ${STOP_SHARE} of budget ${opts.budget}`); exit(3); }
    const { result } = runCase({ ...p, task: { id: p.task, prompt: p.prompt, steps: p.steps }, outDir: opts.out, parseVerdict });
    appendFileSync(file, `${JSON.stringify(result)}\n`);
    if (result.childError) { console.error(`stop: child error in ${p.role}/${p.task}: ${result.childError}`); exit(3); }
    if (result.costUnknown) { console.error(`stop: unknown cost in ${p.role}/${p.task}`); exit(3); }
    if (result.throttled) { console.error(`stop: provider hold in ${p.role}/${p.task} (no retry)`); exit(3); }
    if (result.status !== 0 && result.outcome !== 'step-cap') { console.error(`stop: runner status ${result.status} in ${p.role}/${p.task}`); exit(3); }
    spent += result.cost ?? 0;
    console.log(`${result.outcome} ${p.role} ${p.model} ${p.task}#${p.run} $${result.cost}`);
    await new Promise((r) => setTimeout(r, COOLDOWN_MS));
  }
  console.log(`done: spend $${spent.toFixed(4)} recorded in ${file}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); exit(1); });
}
