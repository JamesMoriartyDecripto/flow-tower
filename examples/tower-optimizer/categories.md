# Role classes and where to shortlist

Generated from `ROLE_CLASSES` in [src/core/roles.ts](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/src/core/roles.ts):
`flow-tower audit` gives each node that runs a model one of these roles, from facts in the tower (first match wins:
node type, model id, spawn edges or lead words, review words, tools, other words, else general).

Categories are the OpenRouter slugs seen on [openrouter.ai/models](https://openrouter.ai/models) on 2026-10-12
(academia, finance, health, legal, marketing, programming, roleplay, seo, translation, trivia). A role with no slug
is shortlisted by modality and capability filters (text, image, video, speech, embeddings, transcription, audio;
tool calls, structured output) and by the [rankings](https://openrouter.ai/rankings) (programming, tool calls,
fastest models, cost per session).

| Role | Title | Needs | Categories | Modality | Look for |
|---|---|---|---|---|---|
| coding | Coding | tools, reasoning | programming | text → text | strong code model with reliable tool calls; long context helps on big repos |
| review | Review | reasoning, structured-output | programming | text → text | judges the work against a rubric; a model that is not the author is a fair judge |
| orchestrator | Orchestrator | tools, reasoning | - | text → text | plans and delegates; follows instructions and calls tools reliably |
| router | Router | low-latency, structured-output | - | text → text | small and fast; picks one label out of a few |
| research | Research | tools, long-context, citations | academia | text → text | web search or retrieval, long context, cites its sources |
| writing | Writing | long-context | marketing, translation | text → text | fluent long-form prose; for translation, strong in the target language |
| data | Data | structured-output | - | text → text | extracts into a JSON schema; low temperature, same answer each run |
| voice-stt | Speech to text | streaming-audio, low-latency | - | audio → text | streaming transcription; latency matters more than polish |
| voice-tts | Text to speech | streaming-audio, low-latency | - | text → audio | fast first audio chunk; natural voice |
| realtime-voice | Realtime voice | streaming-audio, low-latency, tools | - | audio+text → audio+text | speech in and out with barge-in and tool calls mid-conversation |
| vision | Vision | vision | - | text+image → text | reads images and screenshots accurately |
| image-gen | Image generation | - | - | text → image | text to image; prompt adherence and cost per image |
| video-gen | Video generation | - | - | text → video | text to video; clip length and cost per second |
| embeddings | Embeddings | - | - | text → embedding | cheap, stable vectors; index and query must use the same model |
| guard | Guard | low-latency, structured-output | - | text → text | small moderation or safety classifier; returns a label and a score |
| general | General | - | - | text → text | balanced default; no specific need was detected |

Then: `node skills/flow-tower-costs/models.mjs` for today's prices, role and data-policy filters before price, and
the [model-benchmark](../model-benchmark/README.md) method on the project's own cases before a default changes.
