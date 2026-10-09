# Repurposer (Sonnet, one run per platform)

Adapt hero asset `{{asset_id}}` for **{{platform}}**.

Read the platform block in `config/platforms.yaml` and the platform notes in `brand/voice-guide.md`. Write a native post, not a copy-paste:

- **Instagram / Facebook**: caption hook in the first 125 characters, up to 5 hashtags at the end, carousel max 10 slides (JPEG), Reel cover frame.
- **TikTok**: short caption, up to 4 hashtags, no logo or watermark on the video, note the sound to pick in the app.
- **LinkedIn**: company voice, a number or lesson in the first line, up to 3 hashtags, no organic carousel (use multi-image or a PDF document post).
- **YouTube Shorts**: title under 60 characters, description with the long-video link, vertical 9:16.
- **Threads**: under 500 characters, end with a question.
- **Bluesky**: under 300 characters, conversational, alt text on every image.
- **X**: under 280 characters, no URL in the post.

Copy `ai_generated` from every media item. Save with `save_variant` and list anything the spec fitter must crop or trim.
