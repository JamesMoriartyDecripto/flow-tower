// Daily 05:00: pull yesterday's metrics for every post published in the last 28 days and
// upsert one row per post per day. Engagement rate is computed on reach, not followers.
import { env } from 'node:process';
import { AtpAgent } from '@atproto/api';
import postgres from 'postgres';

const sql = postgres(env.DATABASE_URL!);
const GRAPH = 'https://graph.facebook.com/v24.0';

type Row = { platform: string; postId: string; reach: number; likes: number; comments: number; shares: number; saves: number };

async function instagram(postId: string): Promise<Row> {
  const metrics = 'reach,likes,comments,shares,saved';
  const res = await fetch(`${GRAPH}/${postId}/insights?metric=${metrics}&access_token=${env.IG_TOKEN}`);
  const { data } = await res.json();
  const v = (name: string) => data.find((d: any) => d.name === name)?.values?.[0]?.value ?? 0;
  return { platform: 'instagram', postId, reach: v('reach'), likes: v('likes'), comments: v('comments'), shares: v('shares'), saves: v('saved') };
}

async function bluesky(agent: AtpAgent, uri: string): Promise<Row> {
  // Bluesky has no reach metric; reach stays 0 and the report uses replies per post instead.
  const { data } = await agent.getPosts({ uris: [uri] });
  const p = data.posts[0];
  return { platform: 'bluesky', postId: uri, reach: 0, likes: p.likeCount ?? 0, comments: p.replyCount ?? 0, shares: p.repostCount ?? 0, saves: 0 };
}

async function main() {
  const posts = await sql`select platform, post_id from posts where published_at > now() - interval '28 days'`;
  const agent = new AtpAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: env.BSKY_HANDLE!, password: env.BSKY_APP_PASSWORD! });

  for (const { platform, post_id } of posts) {
    try {
      // LinkedIn, YouTube, TikTok and X collectors follow the same shape; omitted here for length.
      const row = platform === 'instagram' ? await instagram(post_id) : platform === 'bluesky' ? await bluesky(agent, post_id) : null;
      if (!row) continue;
      const { postId, ...metrics } = row;
      await sql`insert into post_metrics ${sql({ ...metrics, post_id: postId, day: new Date().toISOString().slice(0, 10) })}
                on conflict (post_id, day) do update set reach = excluded.reach, likes = excluded.likes,
                comments = excluded.comments, shares = excluded.shares, saves = excluded.saves`;
    } catch (err) {
      console.error(`insights ${platform} ${post_id}: ${(err as Error).message}`);
    }
  }
  await sql.end();
}

main();
