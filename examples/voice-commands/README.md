# Voice Commands

The voice widget of Flow Tower itself (issues #62, #63, #68 and #72-#74), mapped from its code. Press **V** (or **MIC**) and speak.
Navigation ("apri dev squad", "livello 2", "vai al nodo triage") moves the tower as if you had used the keyboard.
Questions ("cosa c'è nel secondo livello?", "a cosa è collegato questo nodo?", "how many MCP servers are there?")
go to a voice agent that reads the tower on screen, shows what it talks about and answers aloud. With
**Learn from my sessions** on, it keeps a text journal of the turns and proposes fixes you accept or reject.
It is dogfooding: the tower sets `root: ../..`, so every node opens the real source file it describes.

```bash
node bin/flow-tower.js examples/voice-commands     # or: npm run dev, then open "Voice Commands"
```

To try the widget itself, put `OPENROUTER_API_KEY` in `~/.config/flow-tower/.env` (or in the environment) and
restart. A git-ignored `.env` in the flow-tower folder still works as a fallback. Without a key the caption says so and
the microphone is never opened.

## Layers

| Layer | What it shows |
|---|---|
| Capture | V key or MIC button, Esc, the voice settings (sensitivity, Interrupt by voice), the key check (`GET /api/voice`), the always-on recorder, the per-bin noise floor calibrated at start, the speech-or-noise decision on the voice band, the clip with its recording time, the half-duplex gate |
| Transcription | The speech-engine decision: OpenRouter STT (wired), and the three engines weighed and not chosen, dashed |
| Understanding | Echo filter, Whisper noise ("Grazie.", "Thank you."), barge-in, the agent-or-parser route, the pending numbered pick, the local parser, "Ambiguous?" with its loop |
| Conversation | The voice agent: screen and history per turn, the LLM step, the tool-calls decision with its 4-step cap, the 13 tower tools, the spoken reply and the TTS model |
| Actions | The same store calls as the keyboard, the caption, the 2-minute idle stop, mic off |
| Learning | The opt-in journal: the toggle, each turn recorded, outcome marks (corrected, undone, interrupted), the journal file, the review that runs at mic off after 20 turns, the real-names filter, the voice memory, the Settings panel where you accept or reject, the SUGGESTIONS chip, and what accepted items change: aliases before the parser and the agent, notes in the agent's prompt |
| Server & Secrets | The key loaded at startup (user folder first), `/api/voice` with `/chat`, `/speak` and the journal routes, the guards (JSON only, cross-site reads refused, per-route body limits, 6 requests at once), the three forwards to OpenRouter with ZDR, error replies, the tests |

Every exit is drawn: no key, microphone denied, request refused (404, 405, 415, 403, 429, 413, 400, 503), OpenRouter
error (502), a review already running (409), a tie (numbered choice), an unknown command (on to the agent, or "Not
understood" without one), an agent error and a spoken reply the browser blocked. Some exits end silently and are only described: noise or a cough
that never becomes a clip, a clip recorded over the reply (half-duplex), a transcript that echoes the reply, Whisper
noise, and a barge-in stop word.

## How a turn runs

1. Every 40 ms the mic compares the 300-3400 Hz spectrum with a per-bin noise floor measured in its first 0.7 s: speech is louder than the floor and peaky, a fan is flat once divided by its floor. Settings > Voice > Microphone sensitivity sets how much louder and peakier (Low for noisy laptops).
2. Half-duplex: a clip recorded while a reply plays, or 700 ms after, is dropped before transcription. **Interrupt by voice** (off by default, for headphones) keeps it. Esc, V or ✕ always stop a reply.
3. The clip is transcribed (`POST /api/voice`). A transcript that repeats the reply it was recorded over is dropped (echo), and so is Whisper's noise text ("Grazie.", "Thank you." alone). With Interrupt by voice on, words recorded over a reply: a stop word stops it, fewer than 3 words are ignored, 3 or more stop it and count as a new request (barge-in).
4. Accepted aliases replace misheard names ("triaje" becomes "triage"). Then `wantsAgent()` routes: a question or a reference to the screen ("questo", "this", "file", "collegato", "il primo") goes to the agent; the rest to the parser, and what the parser does not understand goes on to the agent.
5. The agent loop: the prompt, the accepted notes, the last 12 messages, the screen state and the transcript to `POST /api/voice/chat`, streamed; tool calls run in the page and go back; at most 4 steps, the last with `tool_choice: none`.
6. The answer appears in the caption as it is written and, with Spoken replies on, each finished sentence is spoken through `POST /api/voice/speak` and an `<audio>` element while the next one is still being written (synthesized one or two sentences ahead).
7. With the journal on, the turn is written to it (`POST /api/voice/journal`), and the next words can mark it corrected, undone or interrupted.

## The Learning layer (#68)

Off by default: Settings > Voice > **Learn from my sessions**.

- **What is written.** One line of text per turn: what was heard, the route, what the app did, the outcome, the tower, and for agent turns the tools, time, cost and time to first audio. Never audio.
- **Outcomes learned later.** "no", "not that", "sbagliato", "i meant" within 15 s mark the last turn *corrected*; "back", "indietro", "undo" alone within 6 s of an action mark it *undone*; a barge-in marks it *interrupted*.
- **The review.** At mic off, after 20 or more new turns in this page (or with Review now), the server sends the oldest 200 unreviewed entries (the rest wait for the next review) to the same chat model (ZDR) with the real names of the towers they mention. It keeps at most 8 suggestions: aliases for misheard names, which must match a real name and not common words, and rules or reply-style notes for the agent. One review runs at a time; its cost shows in the stats.
- **Nothing applies until you accept it.** Suggestions wait in Settings > Voice; a SUGGESTIONS chip in the caption points there. Accepted aliases rewrite the transcript before the parser and the agent; accepted notes join the agent's prompt as a system message. Each can be removed; **Forget everything** deletes the journal and the memory.

### Where your data lives

Outside the repository, in your user folder: `~/.config/flow-tower/` (or the folder in `FLOW_TOWER_HOME`).

| File | What |
|---|---|
| `.env` | Your `OPENROUTER_API_KEY`, read first; the repo's git-ignored `.env` is the fallback |
| `voice-journal.jsonl` | The journal, owner-only (0600) in an owner-only folder; past 5 MB the older half is dropped |
| `voice-memory.json` | Accepted aliases and notes, waiting suggestions, how far the journal was reviewed (0600) |

`/api/file` never serves anything from that folder, even when a tower's root contains it, and the Playwright tests set
`FLOW_TOWER_HOME` to a temporary folder so they never touch yours. The tower's nodes point at the code, never at those
files: a journal is personal and is not part of the example.

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
(MediaRecorder plus a spectrum analyser), no model download, and about a second per command. The trade-off is that audio
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

- **Latency budget.** Voice agents aim for ~0.8-1.2 s from the end of speech to the first audio. Here a question costs transcription, one to four model steps and a speech request, so it is above that; navigation skips the model entirely, the prompt asks for tools called together in one step, and the reply is streamed: its first sentence is spoken while the rest is written. The journal records each agent turn's time to first audio, and Settings shows the average.
- **Prompting for speech.** One or two short sentences of plain text, no markdown, lists or URLs; the user's language; names kept as written; long lists stay on screen.
- **Turn-taking.** Half-duplex by default: laptop speakers leak the reply into the mic, so what is recorded while it plays is dropped (Esc, V or ✕ stop it). With headphones, **Interrupt by voice** allows barge-in: 3 or more words or a stop word interrupt the reply, a cough or "ok" does not (Pipecat's minimum-words strategy).
- **Echo.** The reply plays through an `<audio>` element, whose echo the browser's `echoCancellation` removes from the mic; a word-overlap filter, judged on when the clip was recorded, drops what still gets through.
- **Noise.** Speech is told from a fan by spectral flatness on the voice band after dividing by the noise floor, not by loudness alone; transcripts that are only Whisper's noise text are dropped.
- **Accessible caption.** `role=status` with `aria-live=polite`: screen readers announce what was heard and the answer without interrupting.

## Operational fields used

`trigger` (manual), `limits` (8 s per clip, 4 agent steps, 30 s per OpenRouter call, 6 requests at once, 120 s idle
stop, 200 entries per review), `data` (the voice clip and the reply audio in memory only; transcript text to ZDR
endpoints; the journal and the memory as personal data; the key as a secret), `credentials` (service key on the
server), `approval` (the user accepts or rejects each suggestion), `evals` (the measured numbers above, marked
illustrative), typed `decision` outputs and `status: planned` for the speech engines not chosen. There is no budget cap in the code, so no `budget`.

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
