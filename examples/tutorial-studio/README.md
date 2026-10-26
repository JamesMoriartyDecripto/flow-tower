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

## Run it

Render from a copy outside `examples/`: `node_modules`, Argo's cache and the videos are git-ignored and would fail
the examples test. It needs Node 22, ffmpeg, Chrome and an OpenRouter key (`OPENROUTER_API_KEY`, or the one
`flow-tower squad key` stores in the user folder; it is never printed).

```bash
node bin/flow-tower.js copy tutorial-studio ../tutorial-run
cd ../tutorial-run && npm install
export FLOW_TOWER=/path/to/flow-tower   # the checkout the scratch instance runs from
npm run dry      # every action with a silent voice: no key, no cost
npm run pilot    # the scenes up to pilotUntil, once per voice in tutorial.json
npm run render   # the whole video with the first voice
```

Each run writes `runs/<name>/videos/` (MP4, SRT, VTT) and `runs/<name>/sheet.html`, the contact sheet with one frame
per scene. The voices, the pilot's last scene and the app command live in [tutorial.json](tutorial.json), the
narration in [demos/flow-tower.scenes.json](demos/flow-tower.scenes.json), the actions in
[demos/flow-tower.demo.ts](demos/flow-tower.demo.ts).

## What it shows

| Layer | What happens there |
|---|---|
| 1 · Brief | Audience, goal, length, voice, the sources of truth, what must never appear on screen, the rounds of every sign-off ([brief.md](brief.md)); signed off by the maintainer, or no video |
| 2 · Outline and script | The coding agent drafts the outline ([outline.md](outline.md)) with the [writer prompt](prompts/writer.md); after sign-off (two rounds, then back to the brief), the narration per scene and the browser actions; a scene check (in the sample `argo validate`) proves every scene has its mark, then a silent dry run runs every action before any voice is paid; at most three fixes each |
| 3 · Voice | One clip per scene through OpenRouter's speech endpoint, cached by content; a 60 s pilot rendered with the brief's voice and two alternatives, picked by ear, then pace and names (three rounds, then another voice) |
| 4 · Recording | A scratch instance of the app (own port, empty user folder), a clean-screen check, then the actions in a headless Chrome on the GPU, waiting at each mark for its clip; a failed action, speech request or encode stops the run at its scene |
| 5 · Assembly | Clips aligned to the marks, narration normalised to EBU R128, MP4 with SRT/VTT captions and chapters |
| 6 · Review and publish | A contact sheet with one frame per scene, the [review checklist](review.md), then publish, fix the script or re-record (three rounds, then back to the outline); a release that changes the UI makes the video stale |
| 7 · Tools | Argo, Playwright, ffmpeg, OpenRouter speech: the sample's tools, behind steps that do not depend on them |

## Why these choices

- **Voice first, then the recording.** The clip length decides how long a scene stays on screen, so actions and
  narration stay in sync without hand editing.
- **Argo instead of a custom recorder.** It already does the scenes manifest, the scene marks, the alignment, the
  export with captions and a human-like cursor; the method adds a brief, a review and one TTS engine.
- **Headless Chrome on the GPU.** Headless Chrome renders WebGL in software unless told otherwise, too slow for a 3D
  app. A headed window uses the GPU but is capped and rescaled by the screen: on a 1080p laptop with 1.3x scaling the
  frames came out 1280x617 with a black band, and the encoder refused the odd height. So the sample runs headless
  with the GPU flags flow-tower's own tests use (`GPU_ARGS` in `src/cli/browser.ts`), passed through Argo's
  `contextOptions`, and records at 1920x1080 whatever the screen.
- **A scratch instance.** An empty user folder and sample data keep personal paths, tokens and private projects out
  of every frame.

## Make a tutorial for your own app

The tower is the method; the files are the Flow Tower sample. For another app, copy the folder and replace the
sample piece by piece, keeping the order of the layers:

1. **Brief.** Fill the template in [brief.md](brief.md): audience, goal, sources of truth, what must never appear
   on screen. Get it signed off before anything else.
2. **Outline.** Ask your coding agent for an outline with [prompts/writer.md](prompts/writer.md) and the brief;
   [outline.md](outline.md) shows the shape (one idea per scene).
3. **App.** In [tutorial.json](tutorial.json) set `app.command` (how to start a scratch instance on its own port),
   `app.url`, and `app.homeEnv` if the app reads a user folder from an environment variable (it gets an empty one).
4. **Script.** Write `demos/<name>.scenes.json` (narration per scene) and `demos/<name>.demo.ts` (actions, one
   `narration.mark` per scene); [demos/helpers.ts](demos/helpers.ts) has the overlay cards and the clean-screen
   check. Point the `package.json` scripts at `<name>`.
5. **Dry run** until every action passes (`npm run dry`, no key), then the **pilot** with the voices in
   `tutorial.json` (`pilotUntil` is the last pilot scene), pick one by ear and put it first.
6. **Render**, go through the contact sheet with [review.md](review.md), fix the script or re-record, publish.
   When the UI changes, run `npm run render` again: cached clips of unchanged scenes are not paid twice.

## How the Flow Tower video was made

The sample run, in order, with what went wrong, so the next tutorial skips it (issue #308):

- **Argo over a custom recorder.** Prior art was checked first; Argo already did the scenes manifest, marks,
  alignment and export. The method added the brief, the review, a TTS engine for OpenRouter and a contact sheet.
- **Dry runs first.** The silent dry run found actions that failed before any voice was paid; they were fixed in
  the script.
- **Headless on the GPU.** The second dry run ran every scene, but the headed window came out 1280x617 with a black
  band (screen scaling). Headless Chrome with GPU flags records 1920x1080 on any screen.
- **Voice.** The pilot (the first two scenes) was rendered with ElevenLabs Flash v2.5, Eleven v4 and MAI-Voice-2.1;
  the maintainer then chose `google/gemini-3.8-flash-tts`, voice `Charon`, for quality at a low price. Gemini on
  OpenRouter answers only PCM, so the engine reads PCM (rate from the `Content-Type`) as well as MP3, and ffmpeg
  writes the 32-bit float WAV Argo decodes.
- **Final render.** 17 scenes, 3:46, 1920x1080 at 30 fps, narration at -16.5 LUFS, SRT and VTT captions, chapters.
  The first export stopped at 4% and left an MP4 without its index; `npx argo export flow-tower -c ../../argo.config.mjs`
  from `runs/final/` re-encoded the existing recording without calling the voice again.
- **Code.** Written by the dev squad (`anthropic/claude-haiku-5.5` as coder): 17 runs, $0.12 in total; the lead
  wrote the tower, the brief, the outline and the narration.

## Sources

- Argo, `@argo-video/cli` 0.41 (MIT): [github.com/shreyaskarnik/argo](https://github.com/shreyaskarnik/argo), checked 2026-10-25.
- Playwright screencast API (1.59+, `fps` since 1.64): [playwright.dev/docs/api/class-screencast](https://playwright.dev/docs/api/class-screencast).
- OpenRouter text to speech (request fields, MP3 or PCM output, `supported_voices` in the Models API): [openrouter.ai/docs/guides/overview/multimodal/tts](https://openrouter.ai/docs/guides/overview/multimodal/tts); Gemini TTS answers only `response_format: pcm` (400 on `mp3`), with `audio/pcm;rate=24000;channels=1`, checked 2026-10-26.
- Speech prices as listed by OpenRouter on 2026-10-25 (`skills/flow-tower-costs/models.mjs --role voice-tts`): ElevenLabs Flash v2.5
  $40, Eleven v4 $80, MAI-Voice-2.1 $22 per million characters; Gemini 3.8 Flash TTS (2026-10-26) $0.50 per million input
  tokens and $9 per million audio tokens. Flash v2.5 was chosen for live replies in
  [voice-commands/options/tts.md](../voice-commands/options/tts.md); for the offline narration the maintainer picked Gemini after the pilot.
- ffmpeg `loudnorm` (EBU R128): [ffmpeg.org/ffmpeg-filters.html#loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
- Alternatives weighed: [playwright-recast](https://github.com/ThePatriczek/playwright-recast) (MIT, post-produces
  Playwright traces with an SRT) and [tutorial-forge](https://github.com/jbrecht/tutorial-forge) (PolyForm license, not open source).

The $2 run budget in the tower is illustrative. The sync target (every scene) comes from the review checklist.
