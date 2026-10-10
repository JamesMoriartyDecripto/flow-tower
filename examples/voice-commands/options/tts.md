# Spoken replies: text-to-speech (ElevenLabs Flash v2.5 chosen)

## How it works

When Settings > Spoken replies is on (the default), the agent's answer goes to `POST /api/voice/speak` (`src/server/voice.ts`).
The server sends it to OpenRouter's speech endpoint (`/audio/speech`) with the model, the voice, `response_format: mp3` and `provider: { zdr: true }`, cut at 800 characters.
The page plays the mp3 in an `<audio>` element (`speak()` in `src/app/voice/agent.ts`): browsers cancel the echo of media elements in the microphone, so the agent does not hear itself.
`FLOW_TOWER_TTS_MODEL` and `FLOW_TOWER_TTS_VOICE` pick another model and voice.

## The options

Prices are per million characters, from OpenRouter's list on 2026-10-10.

| Model | Languages | Price | Zero data retention | Verdict |
|---|---|---|---|---|
| `elevenlabs/eleven-flash-v2.5` | 32, one voice for all of them | $20/M | Yes (ElevenLabs endpoint) | **Chosen** |
| `microsoft/mai-voice-2.1-flash` | 23 | $15/M | Yes (Azure endpoint) | Cheaper, but each voice is tied to a language |
| `deepgram/aura-2` | Several, with Italian voices | $30/M | Yes (Deepgram endpoint) | Dearer, voice per language |
| `deepgram/flux-tts` | English only | $45/M in the list | Yes (Deepgram endpoint) | English only; no traffic on its endpoint when checked |

## Why chosen / why not

The agent replies in the language the user spoke, which can change from one turn to the next.
Flash v2.5 speaks all its 32 languages with the same voice (`alice`), so the voice never has to follow the language; OpenRouter describes it as ultra-low latency, for conversational and real-time use.
Measured once: about 0.7 s for a two-sentence reply (illustrative).
MAI-Voice-2.1-Flash costs less, but its voices belong to a language, so the server would have to pick a voice per reply.
Aura-2 has Italian voices but costs half as much again; Flux TTS is English only.
At $20/M a two-sentence reply of ~150 characters costs about $0.003 at list price (computed, not measured).

## Sources

Checked 2026-10-10.

- https://openrouter.ai/api/v1/models?output_modalities=speech (models, languages, prices)
- https://openrouter.ai/api/v1/endpoints/zdr (zero-retention endpoints)
- https://openrouter.ai/api/v1/models/elevenlabs/eleven-flash-v2.5/endpoints and https://openrouter.ai/api/v1/models/deepgram/flux-tts/endpoints
- https://docs.atmoky.com/known-issues (echo cancellation and media elements; unverified)
