// Uploads one approved, C2PA-signed cut to the client's channel with the client's OAuth token
// (credentials: user). Disclosure comes from QA's disclosure.json, never from the packager.
// videos.insert costs 1 unit of the Video Uploads quota; we schedule with status.publishAt.
import { createReadStream, readFileSync } from 'node:fs';
import { google } from 'googleapis';

type Pkg = { title: string; description: string; tags: string[]; publishAt: string; captions?: string; thumbnail?: string };

export async function publishYouTube(file: string, pkg: Pkg, disclosureFile: string, auth: InstanceType<typeof google.auth.OAuth2>) {
  const disclosure = JSON.parse(readFileSync(disclosureFile, 'utf8'));
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      notifySubscribers: true,
      requestBody: {
        snippet: { title: pkg.title, description: pkg.description, tags: pkg.tags, categoryId: '17', defaultLanguage: 'en' }, // 17 = Sports
        status: {
          privacyStatus: 'private', // required for a scheduled publishAt
          publishAt: pkg.publishAt,
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: disclosure.youtube['status.containsSyntheticMedia'] === true,
        },
      },
      media: { body: createReadStream(file) }, // googleapis uses a resumable upload for media
    },
    { retry: true, retryConfig: { retry: 3, statusCodesToRetry: [[500, 599], [429, 429]] } },
  );
  const videoId = res.data.id!;

  if (pkg.captions) {
    await youtube.captions.insert({
      part: ['snippet'],
      requestBody: { snippet: { videoId, language: 'en', name: 'English' } },
      media: { body: createReadStream(pkg.captions) },
    });
  }
  // Long-form only: the first thumbnail is the control; the other two go into Test & compare
  // in YouTube Studio (desktop), which has no public API.
  if (pkg.thumbnail) {
    await youtube.thumbnails.set({ videoId, media: { body: createReadStream(pkg.thumbnail) } });
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), step: 'publish', platform: 'youtube', videoId, publishAt: pkg.publishAt }));
  return videoId;
}
