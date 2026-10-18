# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## data

2 tasks (deadlines-email, invoice-fields), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 6 | 6/6 | 2.9 [1.7-3.4] | 2.6 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | OpenAI |
| `xiaomi/mimo-v2.6-flash` | 6 | 6/6 | 6.9 [4.8-13.5] | 5.6 | 1 | $0.0001 | $0.0001 | 33%, 2/6 warm | 0 | - | Novita, Xiaomi |
| `z-ai/glm-5.3-flash` | 6 | 6/6 | 1.5 [1.1-2.2] | 1.1 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Venice, Decart, Together, BaseTen, InferenceNet |
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 2.2 [1.3-4.1] | 1.9 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 2.6 [1.7-3.6] | 2.4 | 1 | $0.0003 | $0.0003 | 0%, 0/6 warm | 0 | - | Relace, CoreWeave |
| `google/gemini-3.8-flash` | 6 | 6/6 | 2.2 [1.8-4.4] | 1.5 | 1 | $0.0009 | $0.0011 | 0%, 0/6 warm | 0 | - | Google |
| `stepfun/step-5-preview` | 6 | 6/6 | 4.3 [1.6-12.6] | 3.9 | 1 | $0.0012 | $0.0017 | 0%, 0/6 warm | 0 | - | StepFun, InferenceNet, Featherless |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.4 [1.3-2.8] | 0.9 | 1 | $0.0019 | $0.0019 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `moonshotai/kimi-k3` | 6 | 6/6 | 2.6 [1.6-5.4] | 1.5 | 1 | $0.0033 | $0.0037 | 3%, 1/6 warm | 0 | - | AkashML, Parasail, Wafer, DeepInfra |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
