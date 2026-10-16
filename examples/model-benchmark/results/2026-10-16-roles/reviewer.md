# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## reviewer

2 tasks (events-204, store-mutation), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` | 6 | 0/6 (4 unscored) | 25.6 [6.9-55.1] | 1.4 | 2 | $0.0026 | none correct | 39%, 1/6 warm | 0 | - | DigitalOcean, Parasail, Wafer, CoreWeave, Together |
| `stepfun/step-5-preview` | 6 | 0/6 (3 unscored) | 21.3 [16.6-33.9] | 1.4 | 2.5 | $0.0096 | none correct | 71%, 5/6 warm | 0 | - | InferenceNet |
| `z-ai/glm-5.3-flash` | 6 | 0/6 (3 unscored) | 8.7 [4.0-40.8] | 1.5 | 2 | $0.0007 | none correct | 2%, 0/6 warm | 0 | - | Venice, DigitalOcean, Together |
| `xiaomi/mimo-v2.6-flash` | 6 | 0/6 (3 unscored) | 96.8 [53.8-151.2] | 6.1 | 3 | $0.0015 | none correct | 18%, 2/6 warm | 0 | - | Xiaomi, DeepInfra, Novita |
| `openai/gpt-6-luna` | 6 | 0/6 (1 unscored) | 9.0 [5.5-15.3] | 1.8 | 2 | $0.0003 | none correct | 0%, 0/6 warm | 0 | - | OpenAI |
| `anthropic/claude-haiku-5.5` | 6 | 0/6 (3 unscored) | 8.8 [6.8-12.5] | 1.4 | 2 | $0.0008 | none correct | 36%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 6 | 0/6 (5 unscored) | 8.2 [7.0-9.8] | 1.9 | 2 | $0.0099 | none correct | 36%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 6 | 0/6 (6 unscored) | 9.7 [8.0-13.6] | 5.0 | 2 | $0.0021 | none correct | 0%, 0/6 warm | 0 | - | Google |
| `moonshotai/kimi-k3` | 6 | 0/6 (3 unscored) | 19.1 [8.5-42.6] | 2.2 | 2 | $0.016 | none correct | 16%, 0/6 warm | 0 | - | DigitalOcean, Phala, Relace, InferenceNet, Makora, Wafer |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
