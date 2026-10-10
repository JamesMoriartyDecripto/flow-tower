# Voice Commands

The voice-command widget of Flow Tower itself (issue #62), mapped from its code. Press **V** (or **MIC**), say
"apri dev squad", "livello 2" or "vai al nodo triage", and the tower moves as if you had used the keyboard.
It is dogfooding: the tower sets `root: ../..`, so every node opens the real source file it describes.

```bash
node bin/flow-tower.js examples/voice-commands     # or: npm run dev, then open "Voice Commands"
```

To try the widget itself, put `OPENROUTER_API_KEY` in a git-ignored `.env` file in the flow-tower folder (or in the
environment) and restart. Without a key the caption says so and the microphone is never opened.

## Layers

| Layer | What it shows |
|---|---|
| Capture | V key or MIC button, the key check (`GET /api/voice`), the microphone with end-of-speech detection, the compressed clip |
| Transcription | The speech-engine decision: OpenRouter STT (wired), and the three engines weighed and not chosen, dashed |
| Understanding | Pending numbered pick, the local parser (no LLM), the "Ambiguous?" decision with its loop, a planned LLM intent step |
| Actions | The same store calls as the keyboard, the caption, the 2-minute idle stop, mic off |
| Server & Secrets | The key loaded at startup, `/api/voice` and its guards (JSON only, 2 MB, 503 without a key), the forward to OpenRouter with ZDR, error replies, the tests |

Every exit is drawn: no key, microphone denied, request refused (405, 415, 413, 400, 503), OpenRouter error (502),
a tie (numbered choice) and an unknown command ("Not understood").

## The choice, and why

Four engines were weighed; each dashed node opens its page in [`options/`](options):

| Engine | Page | Verdict |
|---|---|---|
| OpenRouter speech-to-text (Whisper large-v3 turbo) | [openrouter-stt.md](options/openrouter-stt.md) | **Chosen** |
| Web Speech API, on-device | [web-speech-local.md](options/web-speech-local.md) | Chrome 139+ only, language pack first |
| Web Speech API, browser cloud | [web-speech-cloud.md](options/web-speech-cloud.md) | Not in Firefox release; audio to the vendor, no ZDR |
| Whisper in the browser (transformers.js) | [whisper-browser.md](options/whisper-browser.md) | 41 MB to 564 MB download first; no WebGPU in Firefox on Intel Macs or Linux |
| LLM intent after the transcript | [llm-intent.md](options/llm-intent.md) | Planned, for free-form requests |

OpenRouter won because it is the fastest and smoothest path **in every browser, Firefox included**: one code path
(MediaRecorder plus a level meter), no model download, and about a second per command. Measured once on this
machine: an Italian command of ~10 KB transcribed in **~1.2 s for ~$0.000005** (illustrative, a single run). The
trade-off is that audio leaves the machine; the server asks OpenRouter for zero-data-retention providers only, and
the key never reaches the page.

Understanding stays local: commands name what is on screen (projects, layers, nodes), so fuzzy matching against
those names is instant, offline and testable. An LLM would add a second round trip to every command.

## Operational fields used

`trigger` (manual), `limits` (8 s per clip, 30 s OpenRouter timeout, 120 s idle stop), `data` (the voice clip,
in memory only; the key as a secret), `credentials` (service key on the server), typed `decision` outputs and
`status: planned` for the alternatives.

## Sources

Checked 2026-10-10.

- https://openrouter.ai/docs/guides/overview/multimodal/stt (request format, limits)
- https://openrouter.ai/api/v1/models/openai/whisper-large-v3-turbo/endpoints (prices per second)
- https://openrouter.ai/docs/guides/features/zdr and https://openrouter.ai/api/v1/endpoints/zdr (zero data retention)
- https://openrouter.ai/docs/guides/features/structured-outputs and https://openrouter.ai/docs/guides/routing/provider-selection (LLM intent step)
- https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json (Web Speech support per browser)
- https://developer.chrome.com/blog/new-in-chrome-139 (on-device recognition in Chrome)
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition and https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static (language packs)
- https://webaudio.github.io/web-speech-api/ (specification)
- https://bugs.webkit.org/show_bug.cgi?id=225298 (Safari needs Siri/Dictation)
- https://blog.addpipe.com/apple-speechanalyzer-api/ (Safari on-device, unverified)
- https://registry.npmjs.org/@huggingface/transformers (transformers.js 4.3.1)
- https://huggingface.co/docs/transformers.js/guides/webgpu and https://huggingface.co/docs/transformers.js/guides/dtypes
- https://huggingface.co/onnx-community/whisper-base/tree/main/onnx (model download sizes)
- https://developer.mozilla.org/en-US/docs/Web/API/GPU (WebGPU in Firefox)
- https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/ (in-browser latency, unverified)
