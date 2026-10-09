// TikTok adapter: upload to the creator's inbox as a draft (scope video.upload).
// A person opens the TikTok notification, picks privacy, interactions, sound and the
// AI-generated / commercial-content toggles, and posts. We never Direct Post.
import { env } from 'node:process';

const API = 'https://open.tiktokapis.com/v2';
const headers = { Authorization: `Bearer ${env.TIKTOK_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' };

export class TikTokLimit extends Error {}

export async function uploadToInbox(videoUrl: string): Promise<{ publishId: string }> {
  // PULL_FROM_URL: the URL prefix must be a verified domain in the TikTok developer portal.
  const res = await fetch(`${API}/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } }),
  });
  const json = await res.json();
  const code = json.error?.code;
  // 6 init calls per minute per token; max 5 pending shares per 24h.
  if (res.status === 429 || code === 'rate_limit_exceeded') throw new TikTokLimit('init rate limit, retry in 1 minute');
  if (code === 'spam_risk_too_many_pending_share') throw new TikTokLimit('5 drafts already pending: finish them in the app');
  if (code && code !== 'ok') throw new Error(`TikTok ${code}: ${json.error.message}`);
  return { publishId: json.data.publish_id };
}

export async function inboxStatus(publishId: string): Promise<string> {
  const res = await fetch(`${API}/post/publish/status/fetch/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ publish_id: publishId }),
  });
  const json = await res.json();
  // SEND_TO_USER_INBOX means the draft is waiting for the person; PUBLISH_COMPLETE after they post.
  return json.data?.status ?? 'UNKNOWN';
}
