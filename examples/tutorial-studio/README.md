# Tutorial Studio

How to turn a web app or a repository into a narrated video tutorial, as a tower: a brief, an outline, a script of
narration and browser actions, a generated voice, a recording of the real app, assembly with captions, and a review of
every scene before publishing. Because the video is a script and not a screen capture, it is rendered again when the
UI changes.

The sample is the Flow Tower tutorial itself: what towers are, how they work, when to use one, and how to start yours
([brief.md](brief.md), [outline.md](outline.md)).

```bash
node bin/flow-tower.js examples/tutorial-studio
```

## What it shows

| Layer | What happens there |
|---|---|
| 1 · Brief | Audience, goal, length, voice, the sources of truth, what must never appear on screen ([brief.md](brief.md)); signed off by the maintainer |
| 2 · Outline and script | The coding agent drafts the outline ([outline.md](outline.md)) with the [writer prompt](prompts/writer.md); after sign-off, the narration per scene and the browser actions; `argo validate` checks that every scene has its mark |
| 3 · Voice | One clip per scene through OpenRouter's speech endpoint, cached by content hash; a 60 s pilot for voice, pace and names |
| 4 · Recording | A scratch instance of the app (own port, empty user folder), a clean-screen check, then Playwright through Argo in a headed Chrome with the GPU, waiting at each mark for its clip |
| 5 · Assembly | Clips aligned to the marks, narration normalised to EBU R128, MP4 with SRT/VTT captions and chapters |
| 6 · Review and publish | A contact sheet with one frame per scene, the [review checklist](review.md), then publish, fix the script or re-record; a release that changes the UI makes the video stale |
| 7 · Tools | Argo, Playwright, ffmpeg, OpenRouter speech |

## Why these choices

- **Voice first, then the recording.** The clip length decides how long a scene stays on screen, so actions and
  narration stay in sync without hand editing.
- **Argo instead of a custom recorder.** It already does the scenes manifest, the scene marks, the alignment, the
  export with captions and a human-like cursor; the method adds a brief, a review and one TTS engine.
- **Headed Chrome.** Headless Chrome renders WebGL in software, too slow for a 3D app; a headed window uses the GPU.
  Its viewport is capped by the screen, so the sample records at 1600x900 and scales to 1080p.
- **A scratch instance.** An empty user folder and sample data keep personal paths, tokens and private projects out
  of every frame.

## Sources

- Argo, `@argo-video/cli` 0.41 (MIT): [github.com/shreyaskarnik/argo](https://github.com/shreyaskarnik/argo), checked 2026-10-25.
- Playwright screencast API (1.59+, `fps` since 1.64): [playwright.dev/docs/api/class-screencast](https://playwright.dev/docs/api/class-screencast).
- OpenRouter text to speech: [openrouter.ai/docs/api-reference/audio/create-speech](https://openrouter.ai/docs/api-reference/audio/create-speech).
- ElevenLabs Flash v2.5 on OpenRouter at $20 per million characters, as recorded in [voice-commands/options/tts.md](../voice-commands/options/tts.md) (2026-10-10).
- ffmpeg `loudnorm` (EBU R128): [ffmpeg.org/ffmpeg-filters.html#loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
- Alternatives weighed: [playwright-recast](https://github.com/ThePatriczek/playwright-recast) (MIT, post-produces
  Playwright traces with an SRT) and [tutorial-forge](https://github.com/jbrecht/tutorial-forge) (PolyForm license, not open source).

The $2 run budget, the 8-minute length target and the 100 % sync target in the tower are illustrative.
