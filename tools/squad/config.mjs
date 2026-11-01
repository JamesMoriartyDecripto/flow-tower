// Per-project squad settings (#265): a repo names its own project, check commands, the folders a coder may write and
// the rules its prompt carries in tools/squad/squad.json. A repo without that file gets DEFAULTS, so the squad still runs.
// Run directly, it serves shell scripts: `check <repo>` runs the configured check, `get <key> <repo>` prints a value.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDirs } from './args.mjs';
import { ROLES, isRole } from './roles.mjs';

// The three model defaults come from the 2026-10-27 benchmark (#322): on the squad's own review cases, packed in one
// request, the reviewer scored the same on glm-5.3-flash as on glm-5.3-flashx at a quarter of the price. The architect
// and lead-judge defaults come from the 2026-10-31 benchmark (#362): architect plans scored 9/9 at 1.8 cents, and
// lead-judge scored 9/9 on claude-sonnet-5.5.
export const DEFAULTS = {
  project: '',
  commands: { check: 'npm run check' },
  write: ['src', 'tests'],
  base: 'origin/main',
  review: ['src'],
  rules: [],
  extras: [],
  models: {
    coder: 'anthropic/claude-haiku-5.5',
    reviewer: 'z-ai/glm-5.3-flash',
    security: 'deepseek/deepseek-v4.1-flash',
    architect: 'openai/gpt-6.1-terra',
    'lead-judge': 'anthropic/claude-sonnet-5.5',
  },
  tower: 'Dev Squad',
  source: 'dev-squad',
  cli: '',
  // The unattended runner's limits (#320): spend per issue in USD, wall clock in minutes, fix rounds, and the poll gap.
  runner: { usdPerIssue: 3, minutes: 90, fixRounds: 2, pollMinutes: 10 },
};

// The two tools that exist only in Flow Tower's own CLI; a project opts in by listing them under extras.
const EXTRAS = ['validate', 'dryrun'];

// The style sentence is shared on purpose: the loop's system prompt and the one-request prompts must say the same thing.
export const STYLE_RULES = 'English only in code and comments; match the surrounding style; comments explain why; files under ~400 lines; prefer the efficient approach when it adds no complexity: batch work instead of handling items one by one, do not repeat work, run independent I/O concurrently (e.g. Promise.all); no premature optimization. Write the minimum that meets the task: no abstraction, option or check it does not ask for. Never touch secret files.';

export function configPath(repo) {
  return join(repo, 'tools', 'squad', 'squad.json');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

// Reads the repo's squad.json and merges it over DEFAULTS. commands and models merge one level deep, so a project
// that sets one command keeps the others. A bad file throws, naming the file and the key, and the caller exits 1:
// a squad that ran with a silently ignored setting would act on the wrong repo.
export function loadConfig(repo) {
  const file = configPath(repo);
  if (!existsSync(file)) return structuredClone(DEFAULTS);
  const fail = (key, why) => { throw new Error(`${file}: "${key}" ${why}`); };
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file}: not valid JSON (${e.message})`); }
  if (!isObj(raw)) throw new Error(`${file}: the config must be a JSON object`);
  for (const k of ['commands', 'models', 'runner']) if (raw[k] !== undefined && !isObj(raw[k])) fail(k, 'must be an object');
  const cfg = {
    ...structuredClone(DEFAULTS),
    ...raw,
    commands: { ...DEFAULTS.commands, ...raw.commands },
    models: { ...DEFAULTS.models, ...raw.models },
    runner: { ...DEFAULTS.runner, ...raw.runner },
  };
  // Every runner limit is a number above zero, except fixRounds, where zero means no fix round at all.
  for (const [k, v] of Object.entries(cfg.runner)) {
    const ok = typeof v === 'number' && Number.isFinite(v) && (k === 'fixRounds' ? v >= 0 : v > 0);
    if (!ok) fail(`runner.${k}`, k === 'fixRounds' ? 'must be a number, 0 or more' : 'must be a number above 0');
  }
  for (const k of ['project', 'base', 'tower', 'source', 'cli']) if (typeof cfg[k] !== 'string') fail(k, 'must be a string');
  for (const [name, cmd] of Object.entries(cfg.commands)) if (typeof cmd !== 'string') fail(`commands.${name}`, 'must be a string');
  // commandArgv runs a command without a shell, so shell syntax would reach the tool as literal arguments.
  for (const [name, cmd] of Object.entries(cfg.commands)) {
    if (/&&|\|\||[|;<>`'"]|\$\(/.test(cmd)) fail(`commands.${name}`, 'uses shell syntax, but the runner runs it without a shell: put it in a script of the project and call that script');
  }
  if (!cfg.commands.check.trim()) fail('commands.check', 'must not be empty');
  // base reaches git diff as an argument: a leading '-' would make it an option (pack.mjs refuses the same).
  if (cfg.base.startsWith('-')) fail('base', 'must be a revision, not an option');
  // A dir goes through writeDirs, the same check as --write: no absolute path, no "..", and one dir per item.
  // An empty list would leave the coder with nowhere to write, or the reviewer with no diff, so it is refused.
  for (const k of ['write', 'review']) {
    if (!Array.isArray(cfg[k])) fail(k, 'must be an array');
    if (cfg[k].length === 0) fail(k, 'must not be empty');
    for (const d of cfg[k]) if (typeof d !== 'string' || writeDirs(d)?.length !== 1) fail(k, `has a bad dir: ${JSON.stringify(d)}`);
  }
  if (!isStrings(cfg.rules)) fail('rules', 'must be an array of strings');
  if (!Array.isArray(cfg.extras) || cfg.extras.some((x) => !EXTRAS.includes(x))) fail('extras', `may only list ${EXTRAS.join(' and ')}`);
  // Both extras call the project's own CLI (cli), so listing one without it would fail only at run time.
  if (cfg.extras.length > 0 && !cfg.cli.trim()) fail('cli', 'must be a non-empty string when extras are listed');
  // An empty model would only fail later at the run's own check: it is refused here, by name, with the file.
  for (const [name, m] of Object.entries(cfg.models)) {
    if (typeof m !== 'string') fail(`models.${name}`, 'must be a string');
    if (!m.trim()) fail(`models.${name}`, 'must not be empty');
  }
  return cfg;
}

// Splits a command into argv. No shell runs it, so there is no quoting and no pipes: a command that needs them
// belongs in a script of the project. A {file} token becomes the file as one argument; without a {file} token the
// file is appended. Returns null for an empty command.
export function commandArgv(command, file) {
  const parts = String(command ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [cmd, ...args] = parts;
  const hasToken = args.includes('{file}');
  const out = [cmd, ...args.flatMap((a) => (a === '{file}' ? (file === undefined ? [] : [file]) : [a]))];
  if (!hasToken && file !== undefined) out.push(file);
  return out;
}

// The model a role runs on: its own models.<role> entry when squad.json names one, else the model of its family
// (roles.mjs). Returns undefined for an unknown role; the caller checks the result is a non-empty string.
// An explicit entry is returned as it is, even when it is invalid: a family fallback would hide the mistake.
export function modelFor(config, role) {
  if (!isRole(role)) return undefined;
  const key = Object.hasOwn(config.models, role) ? role : ROLES[role].family;
  return config.models[key];
}

// The opening of the system prompt: the project's name when it has one, so a prompt never says "Flow Tower" for another repo.
export function systemLine(config, repo) {
  return config.project ? `the repo ${config.project} at ${repo}` : `the repo at ${repo}`;
}

const USAGE = 'usage: node tools/squad/config.mjs check <repo> | get <key> <repo>';

function getKey(obj, key) {
  return key.split('.').reduce((o, k) => (isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined), obj);
}

// Returns the exit code. A bad usage or a bad config throws, and the caller prints it.
function main(args) {
  const [cmd, a, b] = args;
  if (cmd === 'check' && args.length === 2) {
    const config = loadConfig(a);
    const av = commandArgv(config.commands.check);
    // The key stays out of the project's command, the same as in run.mjs: a test the coder wrote could read it.
    const { OPENROUTER_API_KEY: _key, ...env } = process.env;
    const r = spawnSync(av[0], av.slice(1), { cwd: a, stdio: 'inherit', env });
    if (r.error) console.error(r.error.message);
    return r.status ?? 1;
  }
  if (cmd === 'get' && args.length === 3) {
    const value = getKey(loadConfig(b), a);
    if (value === undefined) throw new Error(`no such key: ${a}`);
    const text = Array.isArray(value) ? value.join(',') : isObj(value) ? JSON.stringify(value) : String(value);
    console.log(text);
    return 0;
  }
  throw new Error(USAGE);
}

// Run directly, not imported: the realpath check means a symlinked path to this file still counts as the script.
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
