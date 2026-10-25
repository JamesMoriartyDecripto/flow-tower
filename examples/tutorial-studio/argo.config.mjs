// Argo configuration for the tutorial. scripts/run.mjs starts `argo pipeline` with the
// working directory set to runs/<run name>/, so every path here is relative to that folder.

import { defineConfig } from '@argo-video/cli';
import { env } from 'node:process';
import { openrouter } from './tts/openrouter.mjs';
import { silent } from './tts/silent.mjs';

// Only the real voice run calls the paid speech endpoint; dry runs and the default stay silent.
const engine =
  env.TUTORIAL_TTS === 'openrouter'
    ? openrouter({ model: env.TUTORIAL_TTS_MODEL, voice: env.TUTORIAL_TTS_VOICE })
    : silent;

export default defineConfig({
  // The scratch instance is started by tutorial.json; the default port matches its app.url.
  baseURL: env.TUTORIAL_URL || 'http://127.0.0.1:5343',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: {
    engine,
    // The real voice name, not 'silent', so Argo's cache key and metadata carry the voice in use.
    defaultVoice: env.TUTORIAL_TTS_VOICE || 'silent',
  },
  video: {
    // 1600x900 is the size the brief fixes for the screen.
    width: 1600,
    height: 900,
    fps: 30,
    // Chrome is headed because headless renders WebGL in software, which is too slow and looks wrong for the 3D view.
    browser: 'chromium',
    browserChannel: 'chrome',
    captureMode: 'jpeg-stitch',
    // Highlight the cursor only on clicks, so the viewer sees what was pressed without a constant ring.
    cursorHighlight: { mode: 'click' },
  },
  export: {
    preset: 'slow',
    // Low CRF keeps the UI text sharp enough to read in the captions' context.
    crf: 18,
    // EBU R128 loudness normalisation of the narration.
    audio: { loudnorm: true },
  },
});
