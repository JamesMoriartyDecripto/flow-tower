# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## vision

2 tasks (node-inspector, tower-overview), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | 6 | 6/6 | 4.0 [1.7-5.1] | 3.6 | 1 | $0.0003 | $0.0003 | 0%, 0/6 warm | 2 | - | CoreWeave, Venice, Together |
| `google/gemini-3.8-flash` | 6 | 6/6 | 6.5 [3.3-10.6] | 5.8 | 1 | $0.0022 | $0.0022 | 0%, 0/6 warm | 0 | - | Google |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 5.0 [3.6-5.3] | 4.4 | 1 | $0.0009 | $0.0024 | 67%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `moonshotai/kimi-k3` | 6 | 6/6 | 4.7 [2.5-7.5] | 4.5 | 1 | $0.0063 | $0.0054 | 2%, 2/6 warm | 1 | - | Parasail, Relace, Wafer, Phala, InferenceNet |
| `openai/gpt-6-luna` | 6 | 5/6 | 5.5 [3.8-8.0] | 5.0 | 1 | $0.0002 | $0.0003 | 0%, 0/6 warm | 0 | - | OpenAI |
| `deepseek/deepseek-v4.1-flash` | 6 | 5/6 | 4.5 [2.1-16.7] | 4.3 | 1 | $0.0007 | $0.0007 | 0%, 0/6 warm | 1 | - | Alibaba, Together, CoreWeave, Morph, Crusoe, DigitalOcean |
| `xiaomi/mimo-v2.6-flash` | 6 | 4/6 | 8.5 [4.0-87.9] | 7.3 | 1 | $0.0001 | $0.0002 | 59%, 3/6 warm | 2 | stream broke: terminated | Xiaomi |
| `stepfun/step-5-preview` | 6 | 4/6 | 10.8 [2.0-17.1] | 10.4 | 1 | $0.0021 | $0.0039 | 0%, 0/6 warm | 0 | - | StepFun, Featherless, InferenceNet, DeepInfra |
| `anthropic/claude-haiku-5.5` | 6 | 3/6 | 5.5 [4.0-6.3] | 5.1 | 1 | $0.0001 | $0.0003 | 67%, 4/6 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
