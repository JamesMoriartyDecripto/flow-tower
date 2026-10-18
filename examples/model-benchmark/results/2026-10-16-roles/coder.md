# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## coder

2 tasks (format-price, parse-edge), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 6 | 6/6 | 10.5 [4.8-12.1] | 8.8 | 1 | $0.0003 | $0.0003 | 0%, 0/6 warm | 0 | - | OpenAI |
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 6.3 [4.5-80.1] | 6.2 | 1 | $0.0005 | $0.0005 | 0%, 0/6 warm | 1 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 6 | 6/6 | 3.4 [2.8-27.5] | 1.9 | 1 | $0.0013 | $0.0034 | 0%, 0/6 warm | 0 | - | Google |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 3.5 [3.1-7.3] | 1.4 | 1 | $0.0049 | $0.0060 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `moonshotai/kimi-k3` | 6 | 6/6 | 6.3 [2.9-26.2] | 3.7 | 1 | $0.0061 | $0.010 | 3%, 1/6 warm | 0 | - | Sail Research, Parasail, InferenceNet, DigitalOcean, Morph, Wafer |
| `deepseek/deepseek-v4.1-flash` | 6 | 4/6 | 12.4 [2.1-32.8] | 8.4 | 1 | $0.0021 | $0.0031 | 0%, 0/6 warm | 0 | - | Together, Relace, Crusoe, BaseTen, StreamLake |
| `xiaomi/mimo-v2.6-flash` | 6 | 3/6 | 25.1 [8.5-93.9] | 8.9 | 1 | $0.0011 | $0.0020 | 0%, 0/6 warm | 0 | - | Xiaomi, Novita, Makora, Io Net |
| `z-ai/glm-5.3-flash` | 6 | 1/6 | 3.5 [2.0-4.9] | 1.4 | 1 | $0.0002 | $0.0011 | 0%, 0/6 warm | 0 | - | Together, DigitalOcean, Modal, Wafer, BaseTen |
| `stepfun/step-5-preview` | 6 | 1/6 | 25.2 [19.7-29.3] | 18.5 | 1 | $0.011 | $0.065 | 0%, 0/6 warm | 0 | - | InferenceNet, StepFun |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
