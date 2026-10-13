/**
 * The sync loop of a satellite's shared towers (#164). A change to a shared folder must reach the hub with no
 * manual step: every tick re-reads the shares from the user config (so a share or unshare made by the CLI
 * while the server runs is picked up), collects each folder, and uploads it when its fingerprint differs from
 * the last one the hub accepted. It runs beside the relay in the same server process.
 *
 * A folder that disappeared is an error for that share, never an automatic unshare: the user decides that.
 */
import { parse as parseYaml } from 'yaml';
import { readUserConfig } from './user-config.ts';
import { ShareSchema, type Share } from './config.ts';
import { collectTower, fingerprint, uploadTower, type CollectResult, type SharedFile } from './share-client.ts';
import { isTowerFile } from './share-rules.ts';

export interface ShareSyncOptions {
  /** The user folder holding config.json. */
  home: string;
  /** Fallback hub url, used only while the config has none; the config is read on every tick. */
  url: string;
  /** Fallback sender token, used only while the config has none. */
  token: string;
  intervalMs?: number;
  /** Receives one line per share and distinct error; the token never reaches it. */
  warn: (message: string) => void;
}

export interface TowerSyncState {
  name: string;
  syncedAt?: number;
  error?: string;
  /** Set when the last accepted upload dropped nodes: events that name them will show as unmapped. */
  warning?: string;
}

/** How many removed node keys the warning names before it says `and N more`: a long list helps nobody. */
const WARN_KEYS_CAP = 5;

/**
 * The `layer.node` keys of every tower file in `files`. A file that does not parse contributes nothing: the
 * loader already refused such a folder before it got here, so this only has to be tolerant, not strict.
 * Keys carry no file name: a node moved from one tower file to another is not a removed node.
 */
function nodeKeysOf(files: SharedFile[]): Set<string> {
  const keys = new Set<string>();
  for (const f of files) {
    if (!isTowerFile(f.path)) continue;
    let doc: unknown;
    try { doc = parseYaml(f.content); } catch { continue; }
    const layers = (doc as { layers?: unknown } | null)?.layers;
    if (!Array.isArray(layers)) continue;
    for (const layer of layers as { id?: unknown; nodes?: unknown }[]) {
      if (typeof layer?.id !== 'string' || !Array.isArray(layer.nodes)) continue;
      for (const node of layer.nodes as { id?: unknown }[]) {
        if (typeof node?.id === 'string') keys.add(`${layer.id}.${node.id}`);
      }
    }
  }
  return keys;
}

/** The warning text for removed keys, e.g. `removed nodes: a.b, c.d (...)`. */
function removedText(removed: string[]): string {
  const shown = removed.slice(0, WARN_KEYS_CAP).join(', ');
  const more = removed.length > WARN_KEYS_CAP ? ` and ${removed.length - WARN_KEYS_CAP} more` : '';
  return `removed nodes: ${shown}${more} (events naming them will show as unmapped)`;
}

export interface ShareSync {
  stop(): void;
  state(): TowerSyncState[];
  syncNow(): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 15_000;

/** The shares of the config that are well-formed; anything else is skipped rather than crashing the loop. */
function sharesOf(config: Record<string, unknown>): Share[] {
  if (!Array.isArray(config.shares)) return [];
  const out: Share[] = [];
  for (const entry of config.shares) {
    const parsed = ShareSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function startShareSync(opts: ShareSyncOptions): ShareSync {
  const { home, warn } = opts;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  // The hub the uploads go to. `flow-tower connect` may rotate the token or point at another hub while the
  // server runs, so each tick re-reads it; this is the last one used, to notice a change.
  let target = { url: opts.url, token: opts.token };
  // The fingerprint the hub last accepted, per share name. Kept on failure, so the next tick retries.
  const sent = new Map<string, string>();
  // The state word per share name, rebuilt from the config on every tick.
  let status = new Map<string, TowerSyncState>();
  // The last error message warned per share name: one line per distinct error, not one per tick.
  const warned = new Map<string, string>();
  // The node keys the hub last accepted, per share name. Empty until the first accepted upload, so the first
  // upload after a start never reports removals.
  const accepted = new Map<string, Set<string>>();
  // The removal text logged per share name: the log gets one line per distinct removal, not one per tick.
  const warnedRemoval = new Map<string, string>();
  let running: Promise<void> | undefined;
  let stopped = false;

  const warnOnce = (name: string, message: string) => {
    if (warned.get(name) === message) return;
    warned.set(name, message);
    warn(`flow-tower: share "${name}" not synced: ${message}`);
  };

  /** One share: collect, compare, upload. Any failure is recorded and retried by a later tick. */
  const syncOne = async (share: Share, previous: TowerSyncState | undefined, hub: { url: string; token: string }) => {
    // A failed or unchanged sync is not an upload that removes nothing, so the warning from the last one stands.
    const carried = {
      ...(previous?.syncedAt !== undefined ? { syncedAt: previous.syncedAt } : {}),
      ...(previous?.warning !== undefined ? { warning: previous.warning } : {}),
    };
    const fail = (message: string): TowerSyncState => {
      warnOnce(share.name, message);
      return { name: share.name, ...carried, error: message };
    };
    let collected: CollectResult;
    try {
      collected = await collectTower(share.dir, { withFiles: share.files });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
    if ('error' in collected) return fail(collected.error);

    const fp = fingerprint(collected.files);
    const unchanged = sent.get(share.name) === fp;
    if (!unchanged) {
      const r = await uploadTower(hub.url, hub.token, share.name, collected.files);
      if (!r.ok) return fail(r.error);
      sent.set(share.name, fp);
      warned.delete(share.name);
      // Compare against the set the hub accepted before this upload, then remember this one.
      const nodes = nodeKeysOf(collected.files);
      const prior = accepted.get(share.name);
      accepted.set(share.name, nodes);
      const removed = prior ? [...prior].filter((k) => !nodes.has(k)) : [];
      if (removed.length === 0) {
        warnedRemoval.delete(share.name);
        return { name: share.name, syncedAt: Date.now() };
      }
      const text = removedText(removed);
      if (warnedRemoval.get(share.name) !== text) {
        warnedRemoval.set(share.name, text);
        warn(`flow-tower: share "${share.name}" ${text}`);
      }
      return { name: share.name, syncedAt: Date.now(), warning: text };
    }
    // Nothing changed: the hub already holds this version, so the last sync time stands.
    warned.delete(share.name);
    return { name: share.name, ...carried };
  };

  async function tick(): Promise<void> {
    const config = readUserConfig(home);
    // The user's sharing pause covers towers too: nothing leaves while it is on.
    if (config.paused === true) return;
    // The config wins; the start options are only the fallback for a config that names no hub or no token.
    const hub = {
      url: typeof config.url === 'string' && config.url ? config.url : opts.url,
      token: typeof config.token === 'string' && config.token ? config.token : opts.token,
    };
    // A new hub may hold nothing, so every remembered fingerprint is forgotten: the next upload goes out again.
    // The accepted node keys and the removal warning belong to the old hub too: left behind, the new hub's first
    // upload would be compared against them and report nodes as removed that it never held.
    if (hub.url !== target.url || hub.token !== target.token) {
      sent.clear();
      accepted.clear();
      warnedRemoval.clear();
      target = hub;
    }
    const shares = sharesOf(config);
    const next = new Map<string, TowerSyncState>();
    // Forget what a removed share left behind, so a later share under the same name starts fresh.
    const names = new Set(shares.map((s) => s.name));
    for (const name of [...sent.keys()]) if (!names.has(name)) sent.delete(name);
    for (const name of [...warned.keys()]) if (!names.has(name)) warned.delete(name);
    for (const name of [...accepted.keys()]) if (!names.has(name)) accepted.delete(name);
    for (const name of [...warnedRemoval.keys()]) if (!names.has(name)) warnedRemoval.delete(name);
    for (const share of shares) {
      next.set(share.name, await syncOne(share, status.get(share.name), hub));
    }
    status = next;
  }

  /** Runs one tick; a tick requested while one is already running joins it instead of overlapping. */
  const syncNow = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (!running) {
      running = tick()
        .catch((err: unknown) => warn(`flow-tower: share sync failed: ${err instanceof Error ? err.message : String(err)}`))
        .finally(() => { running = undefined; });
    }
    return running;
  };

  const timer = setInterval(() => void syncNow(), intervalMs);
  // The sync must never keep the dev server alive on its own: the server decides when it stops.
  timer.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    state: () => [...status.values()],
    syncNow,
  };
}
