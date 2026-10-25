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
| 1 · Brief | Audience, goal, length, voice, the sources of truth, what must never appear on screen, the rounds of every sign-off ([brief.md](brief.md)); signed off by the maintainer, or no video |
| 2 · Outline and script | The coding agent drafts the outline ([outline.md](outline.md)) with the [writer prompt](prompts/writer.md); after sign-off (two rounds, then back to the brief), the narration per scene and the browser actions; a scene check (in the sample `argo validate`) proves every scene has its mark, then a silent dry run runs every action before any voice is paid; at most three fixes each |
| 3 · Voice | One clip per scene through OpenRouter's speech endpoint, cached by content; a 60 s pilot rendered with the brief's voice and two alternatives, picked by ear, then pace and names (three rounds, then another voice) |
| 4 · Recording | A scratch instance of the app (own port, empty user folder), a clean-screen check, then the actions in a headed Chrome with the GPU, waiting at each mark for its clip; a failed action, speech request or encode stops the run at its scene |
| 5 · Assembly | Clips aligned to the marks, narration normalised to EBU R128, MP4 with SRT/VTT captions and chapters |
| 6 · Review and publish | A contact sheet with one frame per scene, the [review checklist](review.md), then publish, fix the script or re-record (three rounds, then back to the outline); a release that changes the UI makes the video stale |
| 7 · Tools | Argo, Playwright, ffmpeg, OpenRouter speech: the sample's tools, behind steps that do not depend on them |

## Why these choices

- **Voice first, then the recording.** The clip length decides how long a scene stays on screen, so actions and
  narration stay in sync without hand editing.
- **Argo instead of a custom recorder.** It already does the scenes manifest, the scene marks, the alignment, the
  export with captions and a human-like cursor; the method adds a brief, a review and one TTS engine.
- **Headed Chrome.** Headless Chrome renders WebGL in software, too slow for a 3D app; a headed window uses the GPU.
  Its viewport is capped by the screen, so the sample records at 1600x900 (Argo only scales down, from a 2x capture).
- **A scratch instance.** An empty user folder and sample data keep personal paths, tokens and private projects out
  of every frame.

## Sources

- Argo, `@argo-video/cli` 0.41 (MIT): [github.com/shreyaskarnik/argo](https://github.com/shreyaskarnik/argo), checked 2026-10-25.
- Playwright screencast API (1.59+, `fps` since 1.64): [playwright.dev/docs/api/class-screencast](https://playwright.dev/docs/api/class-screencast).
- OpenRouter text to speech (request fields, MP3 or PCM output, `supported_voices` in the Models API): [openrouter.ai/docs/api-reference/audio/create-speech](https://openrouter.ai/docs/guides/overview/multimodal/tts).
- Speech prices as listed by OpenRouter on 2026-10-25 (`skills/flow-tower-costs/models.mjs --role voice-tts`): ElevenLabs Flash v2.5
  $40, Eleven v4 $80, MAI-Voice-2.1 $22 per million characters. Flash v2.5 was chosen for live replies in
  [voice-commands/options/tts.md](../voice-commands/options/tts.md); a narration is offline, so the pilot compares it with the other two.
- ffmpeg `loudnorm` (EBU R128): [ffmpeg.org/ffmpeg-filters.html#loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
- Alternatives weighed: [playwright-recast](https://github.com/ThePatriczek/playwright-recast) (MIT, post-produces
  Playwright traces with an SRT) and [tutorial-forge](https://github.com/jbrecht/tutorial-forge) (PolyForm license, not open source).

The $2 run budget in the tower is illustrative. The length target (the 9-minute cap) and the sync target (every scene)
come from the brief and the review checklist.
