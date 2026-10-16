# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## intent

2 tasks (navigation, node-and-layer), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `xiaomi/mimo-v2.6-flash` | 6 | 6/6 | 4.4 [1.5-8.2] | 3.6 | 1 | $0.0001 | $0.0001 | 28%, 2/6 warm | 0 | - | Xiaomi, Novita |
| `openai/gpt-6-luna` | 6 | 6/6 | 2.4 [1.5-3.1] | 2.1 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | OpenAI |
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 2.6 [1.3-3.7] | 2.3 | 1 | $0.0001 | $0.0001 | 38%, 2/6 warm | 0 | - | Claude Platform on AWS |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 3.5 [0.8-6.1] | 3.4 | 1 | $0.0001 | $0.0002 | 0%, 0/6 warm | 0 | - | Relace, Morph, CoreWeave, Decart |
| `google/gemini-3.8-flash` | 6 | 6/6 | 3.3 [1.4-4.0] | 2.9 | 1 | $0.0008 | $0.0010 | 0%, 0/6 warm | 0 | - | Google |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.8 [1.4-2.3] | 1.2 | 1 | $0.0015 | $0.0019 | 38%, 2/6 warm | 0 | - | Claude Platform on AWS |
| `moonshotai/kimi-k3` | 6 | 6/6 | 2.7 [1.7-4.2] | 2.4 | 1 | $0.0016 | $0.0020 | 3%, 1/6 warm | 0 | - | InferenceNet, Wafer, Relace, Morph |
| `z-ai/glm-5.3-flash` | 6 | 5/6 | 1.1 [0.6-5.2] | 1.0 | 1 | $0.0001 | $0.0002 | 0%, 0/6 warm | 0 | - | Crusoe, Parasail, Friendli, Together, Wafer, Modal |
| `stepfun/step-5-preview` | 6 | 4/6 | 3.6 [2.0-124.6] | 2.1 | 1 | $0.0014 | $0.0063 | 9%, 1/6 warm | 0 | - | DeepInfra, InferenceNet |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
