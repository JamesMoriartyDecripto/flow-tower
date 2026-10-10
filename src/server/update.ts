import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { env } from 'node:process';

/**
 * Update notice: is a newer release of Flow Tower on GitHub? The only outbound call Flow Tower makes,
 * so it is cheap and quiet: once a day (cached), 1.5 s timeout, silent on any failure, and off with
 * --no-update-check, FLOW_TOWER_NO_UPDATE_CHECK=1 or in CI.
 */

export const RELEASES_API = 'https://api.github.com/repos/JamesMoriartyDecripto/flow-tower/releases/latest';
const DAY = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  current: string;
  latest?: string;
  url?: string;
  newer: boolean;
}

interface Cache { checkedAt: number; latest: string; url: string }

export const updateCheckDisabled = (e: Record<string, string | undefined> = env) =>
  !!(e.FLOW_TOWER_NO_UPDATE_CHECK && e.FLOW_TOWER_NO_UPDATE_CHECK !== '0') || !!e.CI;

export const defaultCacheFile = () => join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'flow-tower', 'update-check.json');

/** "v1.2.3" / "1.2.3" → [1, 2, 3]; anything else (pre-releases included) → undefined. */
function parse(v: string): number[] | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? m.slice(1).map(Number) : undefined;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function readCache(file: string): Cache | undefined {
  try {
    const c = JSON.parse(readFileSync(file, 'utf8')) as Cache;
    return typeof c.checkedAt === 'number' && typeof c.latest === 'string' && typeof c.url === 'string' ? c : undefined;
  } catch {
    return undefined;
  }
}

export async function checkForUpdate({
  current, cacheFile = defaultCacheFile(), fetchImpl = fetch, now = Date.now(),
}: { current: string; cacheFile?: string; fetchImpl?: typeof fetch; now?: number }): Promise<UpdateInfo> {
  const result = (c?: Cache): UpdateInfo => (c ? { current, latest: c.latest, url: c.url, newer: isNewer(c.latest, current) } : { current, newer: false });
  // A cache older than the running version was written before an update (#71): it knows nothing about
  // releases since, so it is neither fresh nor a fallback.
  const read = readCache(cacheFile);
  const cached = read && !isNewer(current, read.latest) ? read : undefined;
  if (cached && now - cached.checkedAt < DAY) return result(cached);
  try {
    const res = await fetchImpl(RELEASES_API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'flow-tower' },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return result(cached);
    const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    if (typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') return result(cached);
    const fresh: Cache = { checkedAt: now, latest: body.tag_name, url: body.html_url };
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(fresh));
    } catch { /* read-only home: just check again next time */ }
    return result(fresh);
  } catch {
    return result(cached); // offline, timeout, rate limit: say nothing new
  }
}
