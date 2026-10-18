# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## citation-support

2 tasks (support-10bis, support-mixed), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 6 | 6/6 | 1.5 [1.4-3.1] | 1.3 | 1 | $0.0001 | $0.0001 | 0%, 0/6 warm | 0 | - | OpenAI |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 5.0 [2.7-9.8] | 5.0 | 1 | $0.0006 | $0.0008 | 11%, 1/6 warm | 0 | - | Ionstream, Relace, CoreWeave, Wafer |
| `anthropic/claude-sonnet-5.5` | 6 | 6/6 | 2.2 [1.4-2.6] | 1.5 | 1 | $0.0004 | $0.0013 | 66%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-opus-5.5` | 6 | 6/6 | 2.7 [2.5-3.0] | 2.6 | 1 | $0.0008 | $0.0026 | 66%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `google/gemini-3.7-flash` | 6 | 4/6 | 7.7 [3.6-13.5] | 7.3 | 1 | $0.0037 | $0.0061 | 0%, 0/6 warm | 0 | - | Google |
| `anthropic/claude-haiku-5.5` | 6 | 0/6 | 1.4 [1.3-2.2] | 1.2 | 1 | $0.0000 | none correct | 66%, 4/6 warm | 0 | - | Claude Platform on AWS |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
