# Conversational agent (chosen)

## How it works

Questions and references to the screen ("cosa c'è nel secondo livello?", "a cosa è collegato questo nodo") skip the parser and go to the agent (`wantsAgent()` in `src/app/voice/agent.ts`); so does anything the parser does not understand.
`converse()` sends the system prompt, the last 12 messages (words only), the screen state and the transcript to `POST /api/voice/chat`.
The server makes one OpenRouter chat completion with the 13 tools of `src/app/voice/tools.ts`, `provider: { zdr: true, require_parameters: true }` and `max_tokens: 500`.
Tool calls come back to the page and run there, on the tower on screen: read tools answer from the tower, act tools use the same store calls as the keyboard.
The loop is capped at 4 steps; the last is sent with `tool_choice: none`, so it must answer.
The answer, one or two sentences in the user's language, appears in the caption and is spoken ([tts.md](tts.md)).

Earlier this page described a planned step: transcript to one JSON command with a strict `json_schema`. #63 replaced it with tools, so the model can read the tower before it answers, act, and say what it did.

## The models

All support tool calling. Prices per million tokens, input / output, on 2026-10-10.

| Model | Price | ZDR endpoints | Role |
|---|---|---|---|
| `google/gemini-3.5-flash-lite` | $0.30 / $2.50 | Google | **Default** (since #70) |
| `google/gemini-3.1-flash-lite` | $0.25 / $1.50 | Google | Previous default |
| `anthropic/claude-haiku-5.5` | $0.10 / $0.50 | Google, Amazon Bedrock | Fallback |
| `mistralai/mistral-small-2603` (Mistral Small 4) | $0.15 / $0.60 | Mistral | For EU-only processing |

"Fallback" means `FLOW_TOWER_AGENT_MODEL=anthropic/claude-haiku-5.5`: the code has no automatic fallback.

## Benchmark (2026-10-10, #70)

Same five questions on the dev-squad tower (four Italian, one English), through the real server and the page tool loop with `provider.zdr`; time from the end of the transcript to the first real sentence sent to speech, the cached acknowledgement excluded. One run each: illustrative.

| Model | First real sentence (mean) | Answers |
|---|---|---|
| `google/gemini-3.5-flash-lite` | 1.80 s | all right, always 2 steps |
| `anthropic/claude-haiku-5.5` | 2.28 s | concise; one wrong node count |
| `google/gemini-3.1-flash-lite` | 2.38 s | all right |
| `inception/mercury-2.5` | 4.0 s | one question unanswered |
| `openai/gpt-6-luna` | 4.74 s | slow; markdown in spoken replies |
| `qwen/qwen3.8-flash` | no answer | no endpoint met zdr + require_parameters |

## At a glance

| | |
|---|---|
| Browsers | All: the loop and the tools run in the page, the model call on the local server |
| Where data goes | No audio: the transcript, the screen state and tool results, to a ZDR endpoint |
| Latency | First real sentence 1.5-2.0 s after the transcript; first audio about 0.6 s with the cached acknowledgement (#70) |
| Cost per turn | About $0.001, measured on dev-squad (illustrative) |

## Why chosen / why not

Navigation stays with the local parser: instant, offline, no second round trip. The agent adds what a parser cannot do: answer questions about the tower and follow references to what is on screen.
Following voice-agent practice, the prompt asks for short plain sentences with no markdown or lists, the user's language, the screen state on every turn, few tools called together in one step, and an action confirmed only after its tool succeeded.
Trade-off: a turn is a transcription, one to four model steps and a speech request, above the ~0.8-1.2 s to first audio that voice agents aim for; the reply is streamed sentence by sentence and a cached acknowledgement covers the wait (#70).

## Sources

Checked 2026-10-10.

- https://openrouter.ai/api/v1/models (models, tool support, prices)
- https://openrouter.ai/api/v1/endpoints/zdr (zero-retention endpoints)
- https://openrouter.ai/docs/guides/routing/provider-selection (`require_parameters`)
- https://openrouter.ai/docs/guides/features/zdr
- https://developers.openai.com/api/docs/guides/voice-prompting (prompting for speech)
- https://soniox.com/wiki/voice-agent-latency-budget (latency budget)
