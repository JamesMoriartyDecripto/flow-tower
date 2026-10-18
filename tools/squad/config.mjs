// Per-project squad settings (#265): a repo names its own project, check commands, the folders a coder may write and
// the rules its prompt carries in tools/squad/squad.json. A repo without that file gets DEFAULTS, so the squad still runs.
// Run directly, it serves shell scripts: `check <repo>` runs the configured check, `get <key> <repo>` prints a value.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDirs } from './args.mjs';

export const DEFAULTS = {
  project: '',
  commands: { check: 'npm run check' },
  write: ['src', 'tests'],
  base: 'origin/main',
  review: ['src'],
  rules: [],
  extras: [],
  models: { coder: 'anthropic/claude-haiku-5.5', reviewer: 'z-ai/glm-5.3-flashx', security: 'deepseek/deepseek-v4.1-flash' },
  tower: 'Dev Squad',
  source: 'dev-squad',
  cli: '',
};

// The two tools that exist only in Flow Tower's own CLI; a project opts in by listing them under extras.
const EXTRAS = ['validate', 'dryrun'];

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
  for (const k of ['commands', 'models']) if (raw[k] !== undefined && !isObj(raw[k])) fail(k, 'must be an object');
  const cfg = {
    ...structuredClone(DEFAULTS),
    ...raw,
    commands: { ...DEFAULTS.commands, ...raw.commands },
    models: { ...DEFAULTS.models, ...raw.models },
  };
  for (const k of ['project', 'base', 'tower', 'source', 'cli']) if (typeof cfg[k] !== 'string') fail(k, 'must be a string');
  for (const [name, cmd] of Object.entries(cfg.commands)) if (typeof cmd !== 'string') fail(`commands.${name}`, 'must be a string');
  if (!cfg.commands.check.trim()) fail('commands.check', 'must not be empty');
  // A dir goes through writeDirs, the same check as --write: no absolute path, no "..", and one dir per item.
  for (const k of ['write', 'review']) {
    if (!Array.isArray(cfg[k])) fail(k, 'must be an array');
    for (const d of cfg[k]) if (typeof d !== 'string' || writeDirs(d)?.length !== 1) fail(k, `has a bad dir: ${JSON.stringify(d)}`);
  }
  if (!isStrings(cfg.rules)) fail('rules', 'must be an array of strings');
  if (!Array.isArray(cfg.extras) || cfg.extras.some((x) => !EXTRAS.includes(x))) fail('extras', `may only list ${EXTRAS.join(' and ')}`);
  for (const [name, m] of Object.entries(cfg.models)) if (typeof m !== 'string') fail(`models.${name}`, 'must be a string');
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
    const r = spawnSync(av[0], av.slice(1), { cwd: a, stdio: 'inherit' });
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
