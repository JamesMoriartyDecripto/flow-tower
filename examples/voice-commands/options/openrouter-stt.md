# OpenRouter speech-to-text (chosen)

## How it works

The browser records a short clip with MediaRecorder and cuts it after ~0.6 s of silence (`src/app/voice/mic.ts`).
It posts the clip as base64 to the local server at `/api/voice` (`src/server/voice.ts`).
The server forwards it to OpenRouter's transcription endpoint, model `openai/whisper-large-v3-turbo`, with `provider: { zdr: true }`.
The API key stays on the server: `OPENROUTER_API_KEY` from the git-ignored dotenv file in the flow-tower folder, or the environment. The browser never sees it.
The transcript goes to the local command parser (`src/app/voice/commands.ts`).

## At a glance

| | |
|---|---|
| Browsers | Firefox, Chrome, Safari, Edge: same path everywhere (Opus in WebM/Ogg; AAC in MP4 on Safari) |
| Where audio goes | Local server, then OpenRouter, then an endpoint OpenRouter lists as zero data retention (DeepInfra or Groq) |
| First-use cost | None: no model download |
| Latency | ~1.2 s, measured once for "vai al nodo del triage" (m4a, ~10 KB) |
| Cost per command | ~$0.0000048, measured once (same clip). List price: DeepInfra $0.00000333/s, Groq $0.0000111/s |

## Why chosen / why not

It works the same in every browser, including Firefox, the user's browser.
No download, about a second per command, and a cost that rounds to zero.
Trade-off: audio leaves the machine. ZDR routing follows OpenRouter's recorded provider policies; not independently verified.
`FLOW_TOWER_VOICE_ZDR=0` turns the ZDR filter off; `FLOW_TOWER_VOICE_MODEL` picks another model.

## Sources

Checked 2026-10-10.

- https://openrouter.ai/docs/guides/overview/multimodal/stt (request shape, 60 s provider timeout, 25 MB limit)
- https://openrouter.ai/api/v1/models/openai/whisper-large-v3-turbo/endpoints (prices)
- https://openrouter.ai/docs/guides/features/zdr
- https://openrouter.ai/api/v1/endpoints/zdr (both turbo endpoints listed)
