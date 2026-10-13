/**
 * The config file as a sender reads it (#90), in plain JS: `emit` runs on every hook call, and starting a
 * second Node with type stripping to load src/server/config.ts tripled its time (0.14 s to 0.41 s).
 * src/server/config.ts imports `stripJsonc` from here, so both read the same JSONC.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Comment bodies are dropped, not the line's newline: a `//` comment must not join two lines. */
function stripComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; } // an escaped quote does not end the string
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; // lands on the "/" (or past the end), the loop's i++ moves to the next char
      continue;
    }
    out += c;
  }
  return out;
}

/** Trailing commas are a JSONC courtesy, so they are only dropped outside a string: "a,]" may be a value. */
function dropTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue; // nothing may follow it but the closing bracket
    }
    out += c;
  }
  return out;
}

/** JSONC: what a human edits. Comments and trailing commas are accepted, everything else is plain JSON. */
export const stripJsonc = (text) => dropTrailingCommas(stripComments(text));

const SENDER_KEYS = ['url', 'user', 'machine', 'token'];
const unset = (v) => v === undefined || v.trim() === '';

function readObject(path) {
  try {
    const parsed = JSON.parse(stripJsonc(readFileSync(path, 'utf8')));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; } // missing or hand-broken: `flow-tower config show` reports it, emit must not fail
}

/**
 * The `library` list from the user folder's config.json (#121b): the paths `flow-tower library` serves.
 * Read in plain JS like senderConfig, because the bin needs it before Vite starts and must not start a
 * second Node. A missing file, a hand-broken one, or a non-array value reads as an empty list.
 */
export function libraryPaths({ env, home = env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower') }) {
  const value = readObject(join(home, 'config.json')).library;
  return Array.isArray(value) ? value.filter((p) => typeof p === 'string' && p.trim()) : [];
}

/**
 * Where a running `serve` listens (#187): it writes this file into the user folder so `emit` and `simulate`
 * find its port without a --url. Plain JS for the same reason as the rest of this file.
 */
export const localServerFile = (home) => join(home, 'local-server.json');

const userHome = (env) => env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower');

/** Records the url of a server this process runs. Never throws: without the file, emit uses the default port. */
export function writeLocalServer({ home = userHome(process.env), url, pid }) {
  try {
    mkdirSync(home, { recursive: true });
    // The file names a local port and a pid, nothing secret, but it is still the user's own: owner only.
    writeFileSync(localServerFile(home), JSON.stringify({ url, pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch { /* read-only home: emit falls back to the default url */ }
}

/**
 * Removes the record only when it is still this process's: a second server may have written its own
 * since. Never throws.
 */
export function clearLocalServer({ home = userHome(process.env), pid }) {
  try {
    if (readObject(localServerFile(home)).pid === pid) rmSync(localServerFile(home), { force: true });
  } catch { /* nothing to clear */ }
}

/**
 * The url of a local server this user folder recorded, when its pid is still alive. A stale file (the
 * server was killed without cleanup) reads as undefined, so emit falls back to the default.
 */
export function localServerUrl({ env = process.env, home = userHome(env) } = {}) {
  const record = readObject(localServerFile(home));
  if (typeof record.url !== 'string' || !record.url.trim() || !Number.isInteger(record.pid)) return undefined;
  try {
    process.kill(record.pid, 0);
  } catch (err) {
    // EPERM: the process exists but belongs to someone else, so it is alive for our purposes.
    if (err?.code !== 'EPERM') return undefined;
  }
  return record.url.trim();
}

/**
 * url, user, machine and token for `emit`: a flag wins, then a non-empty environment variable, then
 * <home>/config.json, then <checkout>/flow-tower.local.json. The same order as src/server/config.ts.
 */
export function senderConfig({ env, checkout, flags = {}, home = env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower') }) {
  const file = { ...readObject(join(checkout, 'flow-tower.local.json')), ...readObject(join(home, 'config.json')) };
  const out = {};
  for (const key of SENDER_KEYS) {
    const envValue = env[`FLOW_TOWER_${key.toUpperCase()}`];
    const value = flags[key] ?? (unset(envValue) ? file[key] : envValue.trim());
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  // `role` and the file's own url/token are read from the config alone, never from a flag or the
  // environment: emit uses them to decide whether the config token belongs to the origin it posts to
  // (a satellite's url and token point at the hub, not at the local relay it must reach).
  const fileText = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  out.role = fileText(file.role);
  out.config = { url: fileText(file.url), token: fileText(file.token) };
  return out;
}
