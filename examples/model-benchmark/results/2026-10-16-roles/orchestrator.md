# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## orchestrator

2 tasks (release-plan, squad-plan), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 6 | 6/6 | 3.3 [1.3-4.1] | 3.0 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | OpenAI |
| `xiaomi/mimo-v2.6-flash` | 6 | 6/6 | 6.2 [3.0-13.3] | 5.8 | 1 | $0.0001 | $0.0001 | 38%, 3/6 warm | 0 | - | Xiaomi, Novita |
| `z-ai/glm-5.3-flash` | 6 | 6/6 | 1.8 [1.1-2.3] | 1.7 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | InferenceNet, Modal, Venice, BaseTen, DigitalOcean |
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 3.1 [1.2-6.4] | 3.0 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 3.7 [1.4-12.9] | 3.5 | 1 | $0.0001 | $0.0002 | 0%, 0/6 warm | 0 | - | Relace, InferenceNet, CoreWeave, Baidu |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.8 [1.2-2.5] | 1.3 | 1 | $0.0013 | $0.0013 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.8-flash` | 6 | 6/6 | 3.6 [2.6-6.4] | 3.5 | 1 | $0.0013 | $0.0016 | 0%, 0/6 warm | 0 | - | Google |
| `moonshotai/kimi-k3` | 6 | 6/6 | 2.9 [1.2-8.0] | 2.8 | 1 | $0.0044 | $0.0046 | 0%, 0/6 warm | 0 | - | Morph, Parasail, Makora |
| `stepfun/step-5-preview` | 6 | 5/6 | 4.3 [1.4-10.0] | 4.1 | 1 | $0.0010 | $0.0014 | 0%, 0/6 warm | 0 | - | DeepInfra, Featherless, InferenceNet, StepFun |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
