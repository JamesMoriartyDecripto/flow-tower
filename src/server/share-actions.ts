/**
 * Sharing a tower folder with the hub (#164), as functions a caller can run: the `share` CLI and a server route
 * both use these. They return data and never print or exit, so the CLI keeps its own output and exit codes, and
 * a route can answer with JSON. The hub url and token come from the user folder's config.json.
 */
import { resolve } from 'node:path';
import { cliName } from '../../bin/cli-name.js';
import { addToLibrary } from '../cli/library.ts';
import type { Share } from './config.ts';
import { asShare, withShare, withoutShare } from './share-entries.ts';
import {
  collectTower, listShared, removeTower, shareName, towerShareName, uploadTower,
  type SharedFile, type SkippedFile,
} from './share-client.ts';
import { shareName as validShareName } from './share-rules.ts';
import { readUserConfig, writeUserConfig } from './user-config.ts';

export type LibraryOutcome = ReturnType<typeof addToLibrary>;

export type ShareOutcome =
  | { ok: true; name: string; dir: string; hub: string; files: SharedFile[]; skipped: SkippedFile[]; sender: string; library: LibraryOutcome }
  // `sent` is set when the folder was collected but the hub refused it, so the CLI can still list what was sent.
  | { ok: false; error: string; recorded: false; sent?: { name: string; files: SharedFile[]; skipped: SkippedFile[] } };

export type UnshareOutcome =
  | { ok: true; name: string; gone: boolean; hubReached: boolean }
  // `unreachable` is set only when the hub could not be asked: the UI offers the config-only removal from this flag.
  | { ok: false; error: string; known?: string[]; unreachable?: true };

export interface ListOutcome {
  shares: Share[];
  hub?: { ok: true; towers: string[] } | { ok: false; error: string };
}

/**
 * The hub files a share under towers/<sender>/<name>. The sender is the token id ("ft_<id>_<secret>"): the hub
 * names the satellite by it, so the id is the part of the token that may be shown back to the user.
 */
export function tokenId(t: string): string | undefined {
  return /^ft_([a-z0-9-]{1,32})_/.exec(t)?.[1];
}

const notConnected = () => `not connected: run ${cliName()} connect <hub-url> first`;

/** The hub url and token, or undefined when the user has not connected yet. */
function connection(home: string): { hub: string; token: string } | undefined {
  const config = readUserConfig(home);
  const hub = typeof config.url === 'string' && config.url ? config.url : undefined;
  const token = typeof config.token === 'string' && config.token ? config.token : undefined;
  return hub && token ? { hub, token } : undefined;
}

function recordedShares(home: string): Share[] {
  const raw = readUserConfig(home).shares;
  return (Array.isArray(raw) ? raw : []).flatMap((s) => {
    const share = asShare(s);
    return share ? [share] : [];
  });
}

/**
 * The entries as they are on disk now. The hub call takes a while, and another `share` or `unshare` may have
 * written meanwhile: a write must build on what is there, not on the snapshot taken at start.
 */
function rawSharesNow(home: string): unknown[] {
  const fresh = readUserConfig(home).shares;
  return Array.isArray(fresh) ? fresh : [];
}

/**
 * The config writes still to run, per home folder. Each write reads config.json as it is at that moment, so two
 * writes from this server must not interleave; the hub calls before them are not queued and may overlap.
 */
const configWrites = new Map<string, Promise<unknown>>();

/** Runs `task` after the writes already queued for `home`. The chain swallows failures so one bad write cannot block the next. */
function queuedWrite<T>(home: string, task: () => T): Promise<T> {
  const run = (configWrites.get(home) ?? Promise.resolve()).then(task);
  configWrites.set(home, run.catch(() => {}));
  return run;
}

/** Uploads the folder `dir` to the hub as `opts.name` and records it, only once the hub has accepted it. */
export async function shareFolder(home: string, dir: string, opts: { files: boolean; name?: string }): Promise<ShareOutcome> {
  const conn = connection(home);
  if (!conn) return { ok: false, error: notConnected(), recorded: false };

  const absDir = resolve(dir);
  const name = opts.name ?? towerShareName(absDir) ?? shareName(absDir);
  if (!validShareName(name)) {
    return { ok: false, error: `not a share name: "${name}" (a-z, 0-9 and dashes, up to 64 characters)`, recorded: false };
  }

  const collected = await collectTower(absDir, { withFiles: opts.files });
  if ('error' in collected) return { ok: false, error: collected.error, recorded: false };

  const { files, skipped } = collected;
  const upload = await uploadTower(conn.hub, conn.token, name, files);
  // The config is not written on failure: a share the hub refused must not show up as shared.
  if (!upload.ok) {
    return {
      ok: false,
      error: `${upload.error}\nnothing was recorded: ${name} is not shared.`,
      recorded: false,
      sent: { name, files, skipped },
    };
  }

  // The share and the library entry are both config.json writes: they run in one queued step, so no other write slips in between.
  const library = await queuedWrite(home, () => {
    writeUserConfig(home, { shares: withShare(rawSharesNow(home), { dir: absDir, name, files: opts.files }) });
    // A shared tower is one of the user's own towers: add it to the library so `library` and the sync see it (#164).
    return addToLibrary(home, absDir);
  });
  return { ok: true, name, dir: absDir, hub: conn.hub, files, skipped, sender: tokenId(conn.token) ?? 'this-machine', library };
}

/**
 * Removes a share from the hub and from config. `target` matches a share by name or by its folder. The entry is
 * dropped when the hub agrees, or has nothing under that name (404); an unreachable hub keeps it unless `force`.
 * With `byName` the target is a share name only: the route uses it so a folder path can never pick a share.
 */
export async function unshareFolder(home: string, target: string, opts: { force: boolean; byName?: boolean }): Promise<UnshareOutcome> {
  const shares = recordedShares(home);
  const match = shares.find((s) => s.name === target || (!opts.byName && s.dir === resolve(target)));
  if (!match) {
    const known = shares.map((s) => s.name);
    return { ok: false, error: `no share named or at "${target}". known shares: ${known.join(', ') || 'none'}`, known };
  }

  const conn = connection(home);
  const r = conn
    ? await removeTower(conn.hub, conn.token, match.name)
    : { ok: false as const, status: 0, error: notConnected() };
  // A 404 means the hub holds nothing under that name, which is what unshare wants: drop the entry.
  const gone = !r.ok && r.status === 404;
  if (!r.ok && !gone && r.status !== 0) {
    return { ok: false, error: `the hub refused the unshare: ${r.error}\n${match.name} stays in config.` };
  }
  if (!r.ok && !gone && !opts.force) {
    return { ok: false, error: `cannot reach the hub (${r.error}): ${match.name} stays shared.\nUse --force to drop it from config only.`, unreachable: true };
  }

  // Dropped from config only after the hub agreed (or had nothing), or on force when it could not be asked.
  await queuedWrite(home, () => writeUserConfig(home, { shares: withoutShare(rawSharesNow(home), match.name) }));
  return { ok: true, name: match.name, gone, hubReached: r.ok || gone };
}

/** The shares recorded in config, and the hub's list of them when the user is connected. */
export async function listShares(home: string): Promise<ListOutcome> {
  const shares = recordedShares(home);
  const conn = connection(home);
  if (!conn) return { shares };
  const r = await listShared(conn.hub, conn.token);
  return { shares, hub: r.ok ? { ok: true, towers: r.towers } : { ok: false, error: r.error } };
}
