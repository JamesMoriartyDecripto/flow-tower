# Role catalogue: models per role, measured

The models to start from for each role a tower node can have (`src/core/roles.ts`; `flow-tower audit` prints each node's role).

**Run:**
- **Date:** 2026-10-16, issue #261.
- **Size:** 968 runs over 17 task sets. Each set has 2 tasks × 3 runs per model, except video, which had 1 run.
- **Routing:** through OpenRouter with `data_collection: deny` and low effort.
- **Cost:** about $7.40 for the candidates plus $0.15 for the judges.
- **Data:** the tables are in [examples/model-benchmark/results/2026-10-16-roles/](../../examples/model-benchmark/results/2026-10-16-roles).

**How a model is picked:** take the highest correct share, then the lowest cost per run, then the fastest median time, across providers (the maintainer's rule). The two alternatives come from **other families**, so a checker never shares its author's blind spots.

**Before trusting a pick:**
- n = 6 per cell is enough to rank, not to settle. Re-run on the project's own cases (see [SKILL.md](SKILL.md)).
- Check what is new since this date: `node models.mjs --role <id> --families 2 --since 2026-10-16`.

| Role (`roles.ts`) | Pick | Correct | $/run | s | Alternatives (other families) | Avoid here |
|---|---|---|---|---|---|---|
| coding | openai/gpt-6-luna | 6/6 | 0.0003 | 11.1 | anthropic/claude-haiku-5.5 (6/6, 6.9 s), google/gemini-3.8-flash (6/6) | z-ai/glm-5.3-flash 1/6, stepfun/step-5-preview 1/6 |
| review | google/gemini-3.8-flash | 6/6 | 0.0021 | 9.8 | anthropic/claude-sonnet-5.5 (5/6), deepseek/deepseek-v4.1-flash (4/6) | openai/gpt-6-luna 1/6 |
| review (security: exploitable issues) | z-ai/glm-5.3-flash | 6/6 | 0.0005 | 7.7 | anthropic/claude-haiku-5.5 (6/6), deepseek/deepseek-v4.1-flash (6/6) | stepfun/step-5-preview 3/6 |
| writing (docs) | xiaomi/mimo-v2.6-flash | 6/6 | 0.00007 | 6.0 | anthropic/claude-haiku-5.5 (6/6, 2.0 s), deepseek/deepseek-v4.1-flash (6/6) | gpt-6-luna, glm-5.3-flash, step-5-preview 3/6 |
| research (answers quoted verbatim from sources) | deepseek/deepseek-v4.1-flash | 6/6 | 0.0006 | 8.7 | z-ai/glm-5.3-flash (5/6), anthropic/claude-haiku-5.5 (5/6) | openai/gpt-6-luna 0/6, google/gemini-3.8-flash 0/6 (prose instead of the asked JSON) |
| router (intent classes, chat) | xiaomi/mimo-v2.6-flash | 6/6 | 0.00006 | 5.3 | openai/gpt-6-luna (6/6, 2.4 s), anthropic/claude-haiku-5.5 (6/6) | stepfun/step-5-preview 4/6 |
| decision (fixed answers with probabilities, Decisions API) | perplexity/pplx-decider-v1.1-27b | 6/6 | 0.00002 | 0.4 | inception/mercury-decide (6/6), microsoft/microsoft-decision-1 (6/6), typesafe/jev-1.14 (6/6) | cloudflare/clef-flash 0/6, upstage/solar-decide-flash 0/6 |
| orchestrator (plans and orders steps) | openai/gpt-6-luna | 6/6 | 0.00007 | 3.9 | z-ai/glm-5.3-flash (6/6, 1.9 s), xiaomi/mimo-v2.6-flash (6/6) | — |
| data (extraction to JSON) | openai/gpt-6-luna | 6/6 | 0.00009 | 2.9 | z-ai/glm-5.3-flash (6/6, 1.6 s), xiaomi/mimo-v2.6-flash (6/6) | — (all 9 at 6/6) |
| guard (injection, data leaks) | z-ai/glm-5.3-flash | 6/6 | 0.00005 | 0.9 | anthropic/claude-haiku-5.5 (6/6), xiaomi/mimo-v2.6-flash (6/6) | — (all 9 at 6/6) |
| vision (screenshots) | z-ai/glm-5.3-flash | 6/6 | 0.0003 | 4.3 | google/gemini-3.8-flash (6/6), anthropic/claude-sonnet-5.5 (6/6) | anthropic/claude-haiku-5.5 3/6 |
| embeddings | qwen/qwen3-embedding-8b | 6/6 | ~0 | 1.4 | google/gemini-embedding-2 (6/6) | the other six miss the Italian set (3/6) |
| rerank | voyageai/rerank-2.5 | 6/6 | 0.00002 | 0.2 | qwen/qwen3-reranker-8b (6/6), cohere/rerank-4-pro (6/6) | voyage rerank-2.5-lite and cohere rerank-4-fast 3/6 (keyword trap); nvidia nemotron rerank `:free`: no endpoint under `data_collection: deny` |
| voice-stt (live) | microsoft/mai-transcribe-2 | 6/6 | 0.0007 | 1.0 | x-ai/grok-stt-1.0 (6/6, 1.5 s), elevenlabs/scribe-v2 (6/6) | nvidia nemotron ASR 0.6b 3/6 (Italian) |
| voice-stt (batch) | qwen/qwen3-asr-1.7b | 6/6 | 0.0002 | 25.1 | x-ai/grok-stt-1.0, microsoft/mai-transcribe-2 | — |
| voice-tts | hexgrad/kokoro-82m | 6/6 | list price lowest | 1.3 | microsoft/mai-voice-2.1-flash (6/6, 1.0 s), google/gemini-3.8-flash-tts (6/6) | deepgram/aura-2 4/6 (Italian) |
| image-gen | recraft/recraft-v4.1-flash | 6/6 | 0.007 | 2.8 | bytedance-seed/seedream-5-0-flash (6/6), microsoft/mai-image-2.6-flash (6/6) | google/gemini-3.1-flash-image 4/6, black-forest-labs/flux.2-pro 4/6 |
| video-gen (5 s, 480p; 1 run: ILLUSTRATIVE) | x-ai/grok-imagine-video-1.5-lite | 2/2 | 0.10 | 27 | google/veo-3.1-lite (2/2, $0.12), bytedance/seedance-2.0-mini (2/2) | — |

Not measured yet: `realtime-voice` and `general`. `general` needs no own pick; use the role the node really has.

## How the tasks are checked

- **Text roles, decision, embeddings, rerank:** exact JSON, or regex. A command script checks code and verbatim quotes.
- **Speech to text:** word error rate against a reference.
  - English: the book text, Project Gutenberg #1930.
  - Italian: three transcription models of three families agreed word for word. Those three were left out of the ranking.
- **Text to speech:** the audio goes back through `openai/gpt-transcribe`, a family no TTS candidate belongs to, and is scored by word error rate.
- **Images and video:** a vision judge from another family answers yes/no questions.
  - Images: `anthropic/claude-sonnet-5.5`.
  - Video: `google/gemini-3.8-flash`, and `xiaomi/mimo-v2.6-pro` for Google's own clips.
  - Spot checks by eye agreed with the judge: the scene and the poster image, and the Grok and Kling ball clips.

## Caveats

- **Review and writing:** only the deterministic checks count. The rubric scores of those tasks were not filled in.
- **Text to speech:** OpenRouter does not return the cost per run, so the pick uses the list price. Kokoro's list price is 0.00000062 per input unit, against 0.000015 for Microsoft MAI Voice and 0.00002 for ElevenLabs v4 Turbo, about 24-32 times lower.
- **Coding:** the dev squad keeps `anthropic/claude-haiku-5.5`. In the #126 field trial on a real refactor, GPT-6 Luna missed the size goal, and Haiku met it with the cleanest diff. A benchmark tie does not beat a field result.
- **Research:** the ai-commercialista example keeps Haiku for its researcher, since the node is built on the Anthropic Citations API, which DeepSeek does not have. A hard dependency outranks the cost rule.
- **Orchestrator:** the `squad-plan` task was re-run after rule 4 was made unambiguous. Under the first wording, adding `doc-writer` to a security fix was a fair reading.
- **Video:** the first video round lost its clips to a download bug (fixed in step 09). Those clips were billed but not judged.
- **Easy sets:** the guard, data, intent and image sets were passed by almost every model. A set every model passes should be retired and made harder.

## Author and checker pairs

Pick the checker from a different family than the author:
- coder Luna or Haiku → reviewer Gemini, security GLM;
- drafter Sonnet → support check Luna (as in ai-commercialista);
- image generator Recraft → vision judge Sonnet or GLM.
