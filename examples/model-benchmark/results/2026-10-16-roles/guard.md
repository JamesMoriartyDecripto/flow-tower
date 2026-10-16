# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## guard

2 tasks (data-leak, injection), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `xiaomi/mimo-v2.6-flash` | 6 | 6/6 | 4.0 [2.4-5.7] | 3.9 | 1 | $0.0000 | $0.0000 | 30%, 2/6 warm | 0 | - | Io Net, Novita, Xiaomi |
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 1.4 [1.1-1.7] | 1.0 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `z-ai/glm-5.3-flash` | 6 | 6/6 | 0.9 [0.6-2.1] | 0.9 | 1 | $0.0000 | $0.0001 | 0%, 0/6 warm | 0 | - | Wafer, GMICloud, CoreWeave, Modal, Friendli |
| `openai/gpt-6-luna` | 6 | 6/6 | 2.5 [1.6-3.4] | 2.5 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | OpenAI |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 2.0 [1.2-2.5] | 1.9 | 1 | $0.0002 | $0.0002 | 0%, 0/6 warm | 0 | - | CoreWeave, Baidu, Relace, Alibaba, BaseTen, DigitalOcean |
| `stepfun/step-5-preview` | 6 | 6/6 | 2.5 [2.0-7.5] | 2.4 | 1 | $0.0008 | $0.0008 | 10%, 1/6 warm | 0 | - | InferenceNet, DeepInfra, StepFun |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.5 [1.1-2.2] | 1.3 | 1 | $0.0010 | $0.0010 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 6 | 6/6 | 6.6 [4.1-7.9] | 6.4 | 1 | $0.0011 | $0.0012 | 0%, 0/6 warm | 0 | - | Google |
| `moonshotai/kimi-k3` | 6 | 6/6 | 1.8 [1.4-2.3] | 1.6 | 1 | $0.0016 | $0.0017 | 0%, 0/6 warm | 0 | - | Makora, AkashML, Parasail, DeepInfra, Morph |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
