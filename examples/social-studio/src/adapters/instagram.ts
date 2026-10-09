// Instagram adapter: container -> poll status_code -> media_publish.
// Images must be JPEG on a public URL (our verified media domain); carousels take up to 10
// children and count as one post; containers expire if not published within 24 hours.
import { env } from 'node:process';

const GRAPH = 'https://graph.facebook.com/v24.0';
const IG = env.IG_USER_ID;

type Item = { kind: 'image' | 'video'; url: string };
type Job = { caption: string; media: Item[]; reel?: boolean; aiGenerated: boolean };

async function post(path: string, params: Record<string, string>): Promise<{ id: string }> {
  const body = new URLSearchParams({ ...params, access_token: env.IG_TOKEN! });
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error?.message ?? `HTTP ${res.status}`), { code: json.error?.code });
  return json;
}

async function waitFinished(containerId: string): Promise<void> {
  // Meta's guidance: poll once per minute for no more than 5 minutes.
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${env.IG_TOKEN}`);
    const { status_code } = await res.json();
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${status_code}`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('container not ready after 5 minutes');
}

function media(item: Item, extra: Record<string, string> = {}) {
  return item.kind === 'image' ? { image_url: item.url, ...extra } : { video_url: item.url, media_type: 'VIDEO', ...extra };
}

export async function publishInstagram(job: Job): Promise<{ mediaId: string }> {
  const ai = job.aiGenerated ? { is_ai_generated: 'true' } : {};
  let creationId: string;

  if (job.media.length > 1) {
    if (job.media.length > 10) throw new Error('carousel over 10 items');
    // The AI flag goes on the carousel container only; on children it is an error.
    const children = await Promise.all(job.media.map((m) => post(`${IG}/media`, media(m, { is_carousel_item: 'true' }))));
    await Promise.all(children.map((c) => waitFinished(c.id)));
    creationId = (await post(`${IG}/media`, { media_type: 'CAROUSEL', children: children.map((c) => c.id).join(','), caption: job.caption, ...ai })).id;
  } else if (job.reel) {
    creationId = (await post(`${IG}/media`, { media_type: 'REELS', video_url: job.media[0].url, caption: job.caption, ...ai })).id;
  } else {
    creationId = (await post(`${IG}/media`, { ...media(job.media[0]), caption: job.caption, ...ai })).id;
  }

  await waitFinished(creationId);
  const { id } = await post(`${IG}/media_publish`, { creation_id: creationId });
  return { mediaId: id };
}
