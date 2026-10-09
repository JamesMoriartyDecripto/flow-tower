// Direct post to TikTok through the Content Posting API with the creator's token
// (credentials: user). is_aigc labels the post "AI-generated". Unaudited client apps can
// only post privately; ours is audited. Limits: 6 requests/min per token, upload_url valid 1 h.
import { readFileSync, statSync } from 'node:fs';

const API = 'https://open.tiktokapis.com/v2/post/publish';

async function call(path: string, token: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error?.code && json.error.code !== 'ok') throw new Error(`tiktok ${path}: ${json.error.code} ${json.error.message}`);
  return json.data;
}

export async function publishTikTok(file: string, caption: string, coverMs: number, token: string, disclosureFile: string) {
  const disclosure = JSON.parse(readFileSync(disclosureFile, 'utf8'));

  // Privacy options depend on the creator's account; query them before every post.
  const creator = await call('/creator_info/query/', token, {});
  const privacy = creator.privacy_level_options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : creator.privacy_level_options[0];
  if (creator.max_video_post_duration_sec && creator.max_video_post_duration_sec < 50) throw new Error('creator max duration below our cut');

  const size = statSync(file).size;
  const init = await call('/video/init/', token, {
    post_info: {
      title: caption.slice(0, 2200),
      privacy_level: privacy,
      disable_duet: false,
      disable_stitch: false,
      disable_comment: false,
      video_cover_timestamp_ms: coverMs,
      brand_content_toggle: false, // paid partnership: set from the brief
      brand_organic_toggle: true, // promotes the creator's own business
      is_aigc: disclosure.tiktok['post_info.is_aigc'] === true,
    },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
  });

  // Single-chunk PUT; must finish within the upload_url's one-hour lifetime.
  const put = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body: readFileSync(file),
  });
  if (!put.ok) throw new Error(`tiktok upload ${put.status}`);
  console.log(JSON.stringify({ ts: new Date().toISOString(), step: 'publish', platform: 'tiktok', publish_id: init.publish_id }));
  return init.publish_id as string;
}
