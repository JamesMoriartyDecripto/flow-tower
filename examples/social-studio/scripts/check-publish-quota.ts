// Quota guard: called by the publisher before every job. Asks the platforms that expose a live
// counter (Instagram, Threads) and checks our own counters for the rest. Returns the first
// platform-level reason to wait, so the job is rescheduled instead of failing at the API.
import { env } from 'node:process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

type Platform = 'instagram' | 'facebook' | 'threads' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | 'bluesky';
type Verdict = { ok: true } | { ok: false; reason: string; retryAfter: string };

const GRAPH = 'https://graph.facebook.com/v24.0';
const THREADS = 'https://graph.threads.net/v1.0';
const limits = parse(readFileSync('config/platforms.yaml', 'utf8'));

async function usage(url: string): Promise<{ used: number; total: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`quota endpoint ${res.status}`);
  const { data } = await res.json();
  return { used: data[0].quota_usage, total: data[0].config.quota_total };
}

// Our own counters (Redis), written by the publisher after each successful call.
type Counters = { get(key: string): Promise<number> };

export async function checkQuota(platform: Platform, counters: Counters): Promise<Verdict> {
  switch (platform) {
    case 'instagram': {
      const u = await usage(`${GRAPH}/${env.IG_USER_ID}/content_publishing_limit?fields=quota_usage,config&access_token=${env.IG_TOKEN}`);
      const own = limits.instagram.own_cap.posts_per_day;
      if (u.used >= u.total) return { ok: false, reason: `IG API limit ${u.used}/${u.total} in 24h`, retryAfter: '1h' };
      if (u.used >= own) return { ok: false, reason: `own cap ${own}/day reached`, retryAfter: '6h' };
      return { ok: true };
    }
    case 'threads': {
      const u = await usage(`${THREADS}/${env.THREADS_USER_ID}/threads_publishing_limit?fields=quota_usage,config&access_token=${env.THREADS_TOKEN}`);
      return u.used < u.total ? { ok: true } : { ok: false, reason: `Threads ${u.used}/${u.total} in 24h`, retryAfter: '1h' };
    }
    case 'tiktok': {
      const pending = await counters.get('tiktok:pending_shares:24h');
      const max = limits.tiktok.pending_shares.max;
      return pending < max ? { ok: true } : { ok: false, reason: `${pending}/${max} inbox drafts pending; finish them in the app`, retryAfter: '3h' };
    }
    case 'youtube': {
      const uploads = await counters.get('youtube:uploads:day');
      return uploads < limits.youtube.quota.uploads_per_day ? { ok: true } : { ok: false, reason: 'upload bucket used', retryAfter: '12h' };
    }
    case 'bluesky': {
      const points = await counters.get('bluesky:points:1h');
      return points + limits.bluesky.write_points.create <= limits.bluesky.write_points.per_hour
        ? { ok: true }
        : { ok: false, reason: 'write points for this hour used', retryAfter: '1h' };
    }
    case 'x': {
      const spentCents = await counters.get('x:spend_cents:week');
      return spentCents + 2 <= limits.x.own_cap.usd_per_week * 100
        ? { ok: true }
        : { ok: false, reason: 'weekly X spend cap reached', retryAfter: '24h' };
    }
    default:
      // Facebook and LinkedIn publish no live counter; the adapters back off on 429.
      return { ok: true };
  }
}
