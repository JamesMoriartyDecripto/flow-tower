# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## security

2 tasks (key-in-log, path-prefix), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` | 6 | 0/6 (6 unscored) | 18.2 [5.0-38.2] | 1.7 | 2 | $0.0012 | none correct | 18%, 0/6 warm | 0 | - | Together, CoreWeave, GMICloud, Morph, DeepInfra, Wafer |
| `stepfun/step-5-preview` | 6 | 0/6 (3 unscored) | 65.8 [16.7-113.6] | 1.6 | 2 | $0.011 | none correct | 43%, 3/6 warm | 0 | - | InferenceNet, DeepInfra |
| `z-ai/glm-5.3-flash` | 6 | 0/6 (6 unscored) | 7.2 [5.5-10.6] | 1.2 | 2 | $0.0005 | none correct | 15%, 0/6 warm | 0 | - | Crusoe, Wafer, DigitalOcean, CoreWeave, Friendli, Together |
| `xiaomi/mimo-v2.6-flash` | 6 | 0/6 (6 unscored) | 97.2 [41.6-123.6] | 2.7 | 2 | $0.0008 | none correct | 14%, 0/6 warm | 0 | - | Xiaomi, Novita |
| `openai/gpt-6-luna` | 6 | 0/6 (5 unscored) | 9.5 [8.3-13.9] | 1.8 | 2 | $0.0003 | none correct | 0%, 0/6 warm | 0 | - | OpenAI |
| `anthropic/claude-haiku-5.5` | 6 | 0/6 (6 unscored) | 11.7 [8.1-12.9] | 1.4 | 2 | $0.0009 | none correct | 36%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 6 | 0/6 (6 unscored) | 9.7 [8.4-13.5] | 1.7 | 2 | $0.012 | none correct | 36%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 6 | 0/6 (6 unscored) | 23.4 [11.8-107.2] | 7.8 | 2 | $0.0026 | none correct | 0%, 0/6 warm | 1 | - | Google, Google AI Studio |
| `moonshotai/kimi-k3` | 6 | 0/6 (6 unscored) | 13.8 [7.7-54.1] | 2.0 | 2 | $0.015 | none correct | 4%, 0/6 warm | 0 | - | Wafer, DeepInfra, Sail Research, Makora, Relace, Parasail |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
