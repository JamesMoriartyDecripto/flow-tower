# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## cited-answer

2 tasks (ai-in-the-studio, cpb-choice), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 8.6 [7.1-10.6] | 1.4 | 3 | $0.0005 | $0.0006 | 20%, 0/6 warm | 0 | - | Sail Research, DigitalOcean, Morph, AtlasCloud, Together, Decart |
| `z-ai/glm-5.3-flash` | 6 | 5/6 | 7.7 [4.5-15.2] | 1.6 | 3 | $0.0006 | $0.0007 | 12%, 0/6 warm | 0 | - | Parasail, BaseTen, Relace, DigitalOcean, Wafer |
| `anthropic/claude-haiku-5.5` | 6 | 5/6 | 8.3 [6.6-9.7] | 2.0 | 3 | $0.0007 | $0.0008 | 68%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `stepfun/step-5-preview` | 6 | 5/6 | 6.4 [4.8-102.3] | 2.6 | 3 | $0.0040 | $0.0071 | 42%, 4/6 warm | 0 | - | DeepInfra, InferenceNet |
| `moonshotai/kimi-k3` | 6 | 5/6 | 8.1 [6.0-14.1] | 3.7 | 3 | $0.0092 | $0.012 | 14%, 0/6 warm | 0 | - | Makora, Wafer, Sail Research, Relace, InferenceNet |
| `anthropic/claude-sonnet-5.5` | 6 | 5/6 | 7.3 [5.7-10.6] | 1.4 | 3 | $0.013 | $0.015 | 49%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `xiaomi/mimo-v2.6-flash` | 6 | 4/6 | 27.5 [4.7-89.1] | 4.1 | 3 | $0.0005 | $0.0008 | 14%, 1/6 warm | 0 | - | Novita, Makora |
| `openai/gpt-6-luna` | 6 | 0/6 | 12.2 [6.0-31.9] | 1.7 | 3 | $0.0008 | none correct | 0%, 0/6 warm | 0 | - | OpenAI |
| `google/gemini-3.8-flash` | 6 | 0/6 | 9.2 [6.3-18.9] | 2.1 | 3.5 | $0.0037 | none correct | 0%, 0/6 warm | 0 | - | Google, Google AI Studio |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
