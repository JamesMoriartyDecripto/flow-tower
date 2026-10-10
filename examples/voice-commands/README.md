# Voice Commands

The voice widget of Flow Tower itself (issues #62 and #63), mapped from its code. Press **V** (or **MIC**) and speak.
Navigation ("apri dev squad", "livello 2", "vai al nodo triage") moves the tower as if you had used the keyboard.
Questions ("cosa c'è nel secondo livello?", "a cosa è collegato questo nodo?", "how many MCP servers are there?")
go to a voice agent that reads the tower on screen, shows what it talks about and answers aloud.
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
| Understanding | Echo filter and barge-in, the agent-or-parser route, the pending numbered pick, the local parser, "Ambiguous?" with its loop |
| Conversation | The voice agent: screen and history per turn, the LLM step, the tool-calls decision with its 4-step cap, the 12 tower tools, the spoken reply and the TTS model |
| Actions | The same store calls as the keyboard, the caption, the 2-minute idle stop, mic off |
| Server & Secrets | The key loaded at startup, `/api/voice` with `/chat` and `/speak`, the guards (JSON only, per-route body limits, 3 calls at once), the three forwards to OpenRouter with ZDR, error replies, the tests |

Every exit is drawn: no key, microphone denied, request refused (404, 405, 415, 403, 429, 413, 400, 503), OpenRouter
error (502), a tie (numbered choice), an unknown command (on to the agent, or "Not understood" without one), an agent
error and a failed spoken reply. Two exits end silently and are only described: a transcript that echoes the reply,
and a barge-in stop word.

## How a turn runs

1. The clip is transcribed (`POST /api/voice`).
2. A transcript that repeats the reply being played is dropped (echo). While a reply plays, a stop word stops it, fewer than 3 words are ignored, 3 or more stop it and count as a new request (barge-in).
3. `wantsAgent()` routes: a question or a reference to the screen ("questo", "this", "file", "collegato", "il primo") goes to the agent; the rest to the parser, and what the parser does not understand goes on to the agent.
4. The agent loop: the prompt, the last 12 messages, the screen state and the transcript to `POST /api/voice/chat`; tool calls run in the page and go back; at most 4 steps, the last with `tool_choice: none`.
5. The answer is shown in the caption and, with Spoken replies on, spoken through `POST /api/voice/speak` and an `<audio>` element.

## The choices, and why

Each choice has its page in [`options/`](options); the dashed nodes open theirs.

| Choice | Page | Verdict |
|---|---|---|
| Speech to text: OpenRouter (Whisper large-v3 turbo) | [openrouter-stt.md](options/openrouter-stt.md) | **Chosen** |
| Speech to text: Web Speech API, on-device | [web-speech-local.md](options/web-speech-local.md) | Chrome 139+ only, language pack first |
| Speech to text: Web Speech API, browser cloud | [web-speech-cloud.md](options/web-speech-cloud.md) | Not in Firefox release; audio to the vendor, no ZDR |
| Speech to text: Whisper in the browser (transformers.js) | [whisper-browser.md](options/whisper-browser.md) | 41 MB to 564 MB download first; no WebGPU in Firefox on Intel Macs or Linux |
| Agent model: Gemini 3.1 Flash-Lite (Claude Haiku 5.5 fallback, Mistral Small 4 for EU) | [llm-intent.md](options/llm-intent.md) | **Chosen**; tool calling and ZDR endpoints for all three |
| Voice: ElevenLabs Flash v2.5 (MAI-Voice-2.1-Flash, Deepgram Aura-2, Flux TTS) | [tts.md](options/tts.md) | **Chosen**: one voice for 32 languages, low latency, $20/M characters, ZDR |

OpenRouter STT won because it is the fastest and smoothest path **in every browser, Firefox included**: one code path
(MediaRecorder plus a level meter), no model download, and about a second per command. The trade-off is that audio
leaves the machine; the server asks OpenRouter for zero-data-retention providers only, and the key never reaches the page.

Navigation stays local: commands name what is on screen, so fuzzy matching against those names is instant, offline and
testable. The agent takes what a parser cannot: questions about the tower and references to the screen.

## Measured (illustrative)

Single runs on this machine, not benchmarks:

| What | Time | Cost |
|---|---|---|
| Transcription, ~10 KB Italian command | ~1.2 s | ~$0.000005 |
| Agent turn on the dev-squad tower | 1.1-2.9 s | ~$0.001 |
| Spoken reply, two sentences | ~0.7 s | not measured (~$0.003 at list price) |

## Voice-agent practice applied

- **Latency budget.** Voice agents aim for ~0.8-1.2 s from the end of speech to the first audio. Here a question costs transcription, one to four model steps and a speech request, so it is well above that; navigation skips the model entirely, and the prompt asks for tools called together in one step. Nothing is streamed yet.
- **Prompting for speech.** One or two short sentences of plain text, no markdown, lists or URLs; the user's language; names kept as written; long lists stay on screen.
- **Barge-in.** The user can talk over the reply: 3 or more words or a stop word interrupt it, a cough or "ok" does not (Pipecat's minimum-words strategy).
- **Echo.** The reply plays through an `<audio>` element, whose echo the browser's `echoCancellation` removes from the mic; a word-overlap filter drops what still gets through.
- **Accessible caption.** `role=status` with `aria-live=polite`: screen readers announce what was heard and the answer without interrupting.

## Operational fields used

`trigger` (manual), `limits` (8 s per clip, 4 agent steps, 30 s per OpenRouter call, 3 calls at once, 120 s idle stop),
`data` (the voice clip and the reply audio in memory only; transcript text to ZDR endpoints; the key as a secret),
`credentials` (service key on the server), `evals` (the measured numbers above, marked illustrative), typed `decision`
outputs and `status: planned` for the speech engines not chosen. There is no budget cap in the code, so no `budget`.

## Sources

Checked 2026-10-10.

- https://openrouter.ai/docs/guides/overview/multimodal/stt (request format, limits)
- https://openrouter.ai/api/v1/models/openai/whisper-large-v3-turbo/endpoints (prices per second)
- https://openrouter.ai/docs/guides/features/zdr and https://openrouter.ai/api/v1/endpoints/zdr (zero data retention)
- https://openrouter.ai/api/v1/models (agent models, tool support, prices)
- https://openrouter.ai/api/v1/models?output_modalities=speech (text-to-speech models and prices)
- https://openrouter.ai/docs/guides/routing/provider-selection (`require_parameters`)
- https://soniox.com/wiki/voice-agent-latency-budget (latency budget)
- https://developers.openai.com/api/docs/guides/voice-prompting (prompting for speech)
- https://docs.pipecat.ai/pipecat/fundamentals/interruptions (barge-in, minimum words)
- https://docs.atmoky.com/known-issues (echo cancellation and media elements, unverified)
- https://scottohara.me/blog/2022/02/05/are-we-live.html (aria-live regions)
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
