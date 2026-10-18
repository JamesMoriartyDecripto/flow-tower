# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## cited-answer

2 tasks (ai-in-the-studio, cpb-choice), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 6 | 6/6 | 8.0 [6.4-9.5] | 1.1 | 3 | $0.0006 | $0.0007 | 77%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `deepseek/deepseek-v4.1-flash` | 6 | 6/6 | 6.1 [4.9-7.9] | 1.4 | 3 | $0.0015 | $0.0012 | 9%, 0/6 warm | 0 | - | Ionstream, BaseTen, DigitalOcean, Wafer, Morph, Alibaba |
| `anthropic/claude-opus-5.5` | 6 | 6/6 | 14.7 [12.1-19.2] | 2.7 | 3.5 | $0.029 | $0.028 | 62%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `anthropic/claude-sonnet-5.5` | 6 | 5/6 | 8.2 [6.6-12.2] | 1.4 | 3 | $0.014 | $0.016 | 49%, 4/6 warm | 0 | - | Claude Platform on AWS |
| `openai/gpt-6-luna` | 6 | 1/6 | 5.2 [4.6-30.0] | 1.2 | 3 | $0.0005 | $0.0046 | 0%, 0/6 warm | 0 | - | OpenAI |
| `google/gemini-3.7-flash` | 6 | 0/6 | 9.1 [6.6-14.7] | 2.6 | 4 | $0.0047 | none correct | 0%, 0/6 warm | 0 | - | Google |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
