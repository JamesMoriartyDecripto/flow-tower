# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## doc-writer

2 tasks (changelog-entry, hook-gotcha), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` | 6 | 0/6 (6 unscored) | 3.6 [0.8-4.5] | 3.2 | 1 | $0.0003 | none correct | 0%, 0/6 warm | 0 | - | AtlasCloud, Relace, Alibaba, StreamLake |
| `stepfun/step-5-preview` | 6 | 0/6 (3 unscored) | 3.3 [1.8-106.5] | 2.0 | 1 | $0.0009 | none correct | 0%, 0/6 warm | 0 | - | InferenceNet, StepFun, Featherless, DeepInfra |
| `z-ai/glm-5.3-flash` | 6 | 0/6 (3 unscored) | 1.3 [1.0-2.2] | 0.7 | 1 | $0.0001 | none correct | 0%, 0/6 warm | 0 | - | Crusoe, Modal, CoreWeave, DigitalOcean, Parasail |
| `xiaomi/mimo-v2.6-flash` | 6 | 0/6 (6 unscored) | 5.6 [2.8-16.3] | 3.7 | 1 | $0.0001 | none correct | 11%, 1/6 warm | 0 | - | Novita, Xiaomi, Io Net |
| `openai/gpt-6-luna` | 6 | 0/6 (3 unscored) | 2.0 [1.7-4.9] | 1.3 | 1 | $0.0001 | none correct | 0%, 0/6 warm | 0 | - | OpenAI |
| `anthropic/claude-haiku-5.5` | 6 | 0/6 (6 unscored) | 1.9 [1.7-2.7] | 1.2 | 1 | $0.0001 | none correct | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 6 | 0/6 (6 unscored) | 2.7 [1.6-3.3] | 1.5 | 1 | $0.0020 | none correct | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 6 | 0/6 (6 unscored) | 2.6 [2.2-7.0] | 1.8 | 1 | $0.0005 | none correct | 0%, 0/6 warm | 0 | - | Google |
| `moonshotai/kimi-k3` | 6 | 0/6 (6 unscored) | 3.1 [1.7-6.0] | 1.7 | 1 | $0.0020 | none correct | 0%, 0/6 warm | 0 | - | Parasail, Sail Research, Relace, DeepInfra, DigitalOcean |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
