# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## abuse-label

2 tasks (labels-a, labels-b), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 6.8 [1.8-7.7] | 6.8 | 1 | $0.0003 | $0.0003 | 66%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 14.0 [4.7-23.3] | 13.7 | 1 | $0.0016 | $0.0018 | 27%, 2/6 warm | 0 | - | StreamLake, CoreWeave, DigitalOcean |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 1.9 [1.5-2.2] | 1.2 | 1 | $0.0010 | $0.0020 | 66%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.7-flash` | 6 | 6/6 | 5.3 [4.7-16.6] | 4.8 | 1 | $0.0029 | $0.0029 | 0%, 0/6 warm | 0 | - | Google, Google AI Studio |
| `anthropic/claude-opus-5.5` | 6 | 6/6 | 3.1 [2.5-4.1] | 2.7 | 1 | $0.0019 | $0.0040 | 66%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `openai/gpt-6-luna` | 6 | 5/6 | 5.4 [3.6-6.8] | 4.8 | 1 | $0.0003 | $0.0003 | 0%, 0/6 warm | 0 | - | OpenAI |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
