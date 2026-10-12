import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { loadLibrary } from '../core/loader.ts';
import { allowedFile, checkFiles, checkPath, isTowerFile, MAX_FILE_BYTES } from './share-rules.ts';

/**
 * The satellite side of sharing a tower folder with the hub (#164). The `share` CLI and the sync loop both
 * call these functions, so what leaves the satellite is decided in one place.
 * Privacy is per share: YAML only (the structure the hub needs to light nodes), or with the files the
 * towers reference, so remote viewers can open them.
 */

export interface SharedFile { path: string; content: string }
export interface SkippedFile { path: string; reason: string }

export type CollectResult = { files: SharedFile[]; skipped: SkippedFile[] } | { error: string };

export type HubResult<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const TIMEOUT_MS = 15_000;
/** The skip reason for a file whose real path lies outside the folder; the user sees why it did not travel. */
const SYMLINK_LEAVES = 'symlink leaves the tower folder';

/** Tower files under `dir`, recursively; never into node_modules or hidden folders, as the loader does. */
function towerFiles(dir: string, out: string[] = []): string[] {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
    const path = resolve(dir, d.name);
    if (d.isDirectory()) towerFiles(path, out);
    else if (d.isFile() && isTowerFile(d.name)) out.push(path);
  }
  return out;
}

/** The path of `abs` relative to `root`, with POSIX separators, or undefined when it lies outside `root`. */
function insideRelative(root: string, abs: string): string | undefined {
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  return rel.split(/[\\/]/).join('/');
}

/** The message of a filesystem error, without the stack: the user needs the reason, not the trace. */
function reasonOf(err: unknown): string {
  return err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.message : String(err);
}

/**
 * The files a satellite sends for the folder `dir`: its tower files, and with `withFiles` the files those
 * towers reference. Anything the loader reached outside `dir`, or that the share rules refuse, is listed
 * in `skipped` with the reason, so the user sees what did not travel.
 */
export async function collectTower(dir: string, opts: { withFiles: boolean }): Promise<CollectResult> {
  const root = resolve(dir);
  try {
    if (!statSync(root).isDirectory()) return { error: `not a folder: ${dir}` };
  } catch {
    return { error: `not a folder: ${dir}` };
  }

  const towers = towerFiles(root).sort();
  if (towers.length === 0) return { error: `no *.tower.yaml in ${dir}` };

  // A symlink is followed by the filesystem, not by the lexical path: the real path decides what may travel.
  // Both sides are resolved, so a symlink to a file inside the folder still goes, and one to outside does not.
  const realRoot = realpathSync(root);
  const files: SharedFile[] = [];
  const skipped: SkippedFile[] = [];
  const seen = new Set<string>();
  for (const abs of towers) {
    const rel = insideRelative(root, abs) ?? basename(abs);
    seen.add(rel);
    // A tower that vanished or is unreadable is reported, not thrown: a stack out of the CLI helps nobody.
    let real: string;
    try {
      real = realpathSync(abs);
    } catch (err) {
      return { error: `cannot read ${rel}: ${reasonOf(err)}` };
    }
    if (insideRelative(realRoot, real) === undefined) { skipped.push({ path: rel, reason: SYMLINK_LEAVES }); continue; }
    try {
      files.push({ path: rel, content: readFileSync(real, 'utf8') });
    } catch (err) {
      return { error: `cannot read ${rel}: ${reasonOf(err)}` };
    }
  }
  // Every tower was a symlink out of the folder: nothing to share, the same error as a folder with no tower.
  if (files.length === 0) return { error: `no *.tower.yaml in ${dir}` };

  if (opts.withFiles) {
    // The loader follows every reference the towers make: node `files`, resources, prompt files, nested towers.
    // `referenced` holds all of them, including a node's `files` that are only checked and never read.
    const lib = await loadLibrary([root]);
    for (const abs of [...lib.referenced].sort()) {
      const rel = insideRelative(root, abs);
      if (rel === undefined) { skipped.push({ path: abs, reason: 'outside the tower folder' }); continue; }
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!allowedFile(rel)) { skipped.push({ path: rel, reason: 'file type not shared' }); continue; }
      // The same path rules the hub enforces: a file it would refuse is reported here, not sent to fail the share.
      const pathError = checkPath(rel);
      if (pathError) { skipped.push({ path: rel, reason: pathError }); continue; }
      // A referenced file that cannot be read is skipped with a reason, like the other refusals above.
      let real: string;
      try {
        real = realpathSync(abs);
      } catch { skipped.push({ path: rel, reason: 'cannot read' }); continue; }
      if (insideRelative(realRoot, real) === undefined) { skipped.push({ path: rel, reason: SYMLINK_LEAVES }); continue; }
      let content: string;
      try {
        if (statSync(real).size > MAX_FILE_BYTES) { skipped.push({ path: rel, reason: 'over 256 KB' }); continue; }
        content = readFileSync(real, 'utf8');
      } catch { skipped.push({ path: rel, reason: 'cannot read' }); continue; }
      files.push({ path: rel, content });
    }
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const checked = checkFiles(files);
  if ('error' in checked) return { error: checked.error };
  return { files: checked.files, skipped };
}

/**
 * The default name of a shared folder: its base name as a slug. The hub accepts only a-z, 0-9 and -, so
 * every other character becomes a dash; `tower` is the fallback when nothing is left.
 */
export function shareName(dir: string): string {
  const slug = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug || 'tower';
}

/**
 * A sha256 over the sorted paths and contents: the sync loop compares it to tell a change, so the order the
 * files were collected in must not matter.
 */
export function fingerprint(files: SharedFile[]): string {
  const hash = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    // NUL separators keep ("ab", "c") and ("a", "bc") from hashing the same.
    hash.update(`${f.path}\0${f.content}\0`);
  }
  return hash.digest('hex');
}

/** One request to the hub, signed with the sender token. The token never reaches an error message. */
async function call(
  method: string, url: string, token: string, body?: unknown,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; error: string }> {
  const redact = (s: string) => (token ? s.split(token).join('[token]') : s);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'x-flow-tower-token': token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, status: 0, error: redact(err instanceof Error ? err.message : String(err)) };
  }
  const json: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, json };
  const message = (json as { error?: unknown } | undefined)?.error;
  return {
    ok: false,
    status: res.status,
    error: redact(typeof message === 'string' ? message : `hub answered ${res.status}`),
  };
}

const towersUrl = (hub: string) => `${hub.replace(/\/+$/, '')}/api/hub/towers`;

/** Uploads a collected folder under `name` on the hub, replacing what the hub held under that name. */
export async function uploadTower(
  hub: string, token: string, name: string, files: SharedFile[],
): Promise<HubResult<{ files: number; bytes: number }>> {
  const r = await call('PUT', `${towersUrl(hub)}/${encodeURIComponent(name)}`, token, { files });
  if (!r.ok) return r;
  const reply = (r.json ?? {}) as { files?: unknown; bytes?: unknown };
  // The hub reports what it stored; the local count is the fallback for a hub that answers without it.
  return {
    ok: true,
    files: typeof reply.files === 'number' ? reply.files : files.length,
    bytes: typeof reply.bytes === 'number' ? reply.bytes : files.reduce((n, f) => n + Buffer.byteLength(f.content), 0),
  };
}

/** Removes the shared folder `name` from the hub. */
export async function removeTower(hub: string, token: string, name: string): Promise<HubResult> {
  const r = await call('DELETE', `${towersUrl(hub)}/${encodeURIComponent(name)}`, token);
  return r.ok ? { ok: true } : r;
}

/** The shared folders the hub holds for this token. */
export async function listShared(hub: string, token: string): Promise<HubResult<{ towers: string[] }>> {
  const r = await call('GET', towersUrl(hub), token);
  if (!r.ok) return r;
  const towers = (r.json as { towers?: unknown } | undefined)?.towers;
  return { ok: true, towers: Array.isArray(towers) ? towers.filter((t): t is string => typeof t === 'string') : [] };
}
