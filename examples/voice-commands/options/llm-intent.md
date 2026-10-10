# LLM intent step (planned)

## How it works

After transcription, the transcript and the names on screen would go to an LLM via OpenRouter chat completions.
`response_format` with a strict `json_schema` makes the reply a command the app can run.
`provider.require_parameters: true` routes only to endpoints that support structured outputs; `provider.zdr` keeps the zero-retention rule.
This would handle free-form requests such as "show me where tests decide the release".

## At a glance

| | |
|---|---|
| Browsers | All: it would run on the local server, after the transcript |
| Where audio goes | No audio: only the transcript and on-screen names, to a ZDR endpoint |
| First-use cost | None |
| Latency | A second network round trip per command; not measured |
| Cost per command | Depends on the model; not measured |

## Why chosen / why not

Not now: every command would pay a second round trip.
The local parser (`src/app/voice/commands.ts`) already handles the navigation grammar (projects, layers, nodes, views; Italian and English) instantly and offline.
Planned for the free-form commands the parser cannot match (it returns `unknown`).

## Sources

Checked 2026-10-10.

- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/features/zdr

Next: [#63](https://github.com/JamesMoriartyDecripto/flow-tower/issues/63) turns this step into a conversational agent: tower tools (layers, nodes, connections, files) and spoken replies through OpenRouter text-to-speech.
