# Model benchmark results

Measured 2026-10-11 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## doc-writer

2 tasks (changelog-entry, hook-gotcha), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 2.1 [1.5-2.4] | 1.2 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Claude Platform on AWS |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 1.9 [1.7-10.2] | 1.6 | 1 | $0.0002 | $0.0003 | 0%, 0/6 warm | 0 | - | OpenInference, Relace, CoreWeave, Wafer, Together |
| `openai/gpt-6-luna` | 6 | 5/6 | 1.3 [1.1-1.8] | 0.7 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | OpenAI |
| `inception/mercury-2.5` | 6 | 4/6 | 1.3 [1.0-1.8] | 1.2 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | Inception |
| `z-ai/glm-5.3-flashx` | 6 | 3/6 | 1.7 [1.4-2.1] | 1.6 | 1 | $0.0002 | $0.0004 | 11%, 1/6 warm | 0 | - | Z.AI |
| `google/gemini-3.5-flash-lite` | 6 | 3/6 | 1.0 [0.9-1.2] | 0.7 | 1 | $0.0003 | $0.0005 | 0%, 0/6 warm | 0 | - | Google |
| `deepseek/deepseek-v4-pro` | 6 | 3/6 | 11.4 [5.9-14.8] | 10.1 | 1 | $0.0014 | $0.0033 | 10%, 1/6 warm | 0 | - | Novita, AtlasCloud, GMICloud, StreamLake, Cloudflare |
| `qwen/qwen3.7-flash` | 6 | 1/6 | 16.4 [9.1-23.2] | 16.1 | 1 | $0.0003 | $0.0017 | 0%, 0/6 warm | 0 | - | Alibaba |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
