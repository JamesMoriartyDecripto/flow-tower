// Bluesky adapter. Sessions are reused: createSession is limited to 30 per 5 minutes and 300 a
// day per account, so the worker logs in once and resumes the saved session afterwards.
// Each post costs 3 write points (5,000 per hour, 35,000 per day).
import { AtpAgent, RichText, type AtpSessionData } from '@atproto/api';
import { env } from 'node:process';

type Store = { get(): Promise<AtpSessionData | undefined>; set(s: AtpSessionData): Promise<void> };
type Image = { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png'; alt: string };

async function agentFor(store: Store): Promise<AtpAgent> {
  const agent = new AtpAgent({
    service: 'https://bsky.social',
    persistSession: (_evt, session) => {
      if (session) void store.set(session);
    },
  });
  const saved = await store.get();
  if (saved) await agent.resumeSession(saved);
  else await agent.login({ identifier: env.BSKY_HANDLE!, password: env.BSKY_APP_PASSWORD! });
  return agent;
}

export async function publishBluesky(store: Store, text: string, images: Image[] = []): Promise<{ uri: string }> {
  if (images.length > 4) throw new Error('Bluesky allows 4 images per post');
  const agent = await agentFor(store);

  // RichText detects links and mentions and computes the byte-offset facets.
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  if (rt.graphemeLength > 300) throw new Error(`post is ${rt.graphemeLength} graphemes, limit 300`);

  const uploaded = [];
  for (const img of images) {
    const { data } = await agent.uploadBlob(img.bytes, { encoding: img.mime });
    uploaded.push({ image: data.blob, alt: img.alt });
  }

  const res = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: uploaded.length ? { $type: 'app.bsky.embed.images', images: uploaded } : undefined,
    createdAt: new Date().toISOString(),
  });
  return { uri: res.uri };
}
