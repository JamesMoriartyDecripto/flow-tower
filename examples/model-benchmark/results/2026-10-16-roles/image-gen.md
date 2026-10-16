# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## image-gen

2 tasks (poster-text, scene-objects), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `recraft/recraft-v4.1-flash` | 6 | 6/6 | 2.8 [2.5-4.1] | 2.8 | 1 | $0.0070 | $0.0070 | -, 0/6 warm | 0 | - | - |
| `bytedance-seed/seedream-5-0-flash` | 6 | 6/6 | 12.4 [10.2-13.9] | 12.4 | 1 | $0.018 | $0.018 | -, 0/6 warm | 0 | - | - |
| `microsoft/mai-image-2.6-flash` | 6 | 6/6 | 10.7 [8.7-11.8] | 10.7 | 1 | $0.020 | $0.020 | -, 0/6 warm | 0 | - | - |
| `openai/gpt-image-1-mini` | 6 | 6/6 | 41.6 [40.7-49.0] | 41.6 | 1 | $0.050 | $0.050 | -, 0/6 warm | 0 | - | - |
| `x-ai/grok-imagine-image-2.0` | 6 | 6/6 | 46.4 [22.9-71.0] | 46.4 | 1 | $0.060 | $0.060 | -, 0/6 warm | 0 | - | - |
| `qwen/qwen-image-3` | 6 | 5/6 | 63.6 [57.6-75.9] | 63.6 | 1 | $0.030 | $0.036 | -, 0/6 warm | 0 | - | - |
| `black-forest-labs/flux.2-pro` | 6 | 4/6 | 10.1 [8.2-11.4] | 10.1 | 1 | $0.030 | $0.045 | -, 0/6 warm | 0 | - | - |
| `google/gemini-3.1-flash-image` | 6 | 4/6 | 9.7 [8.9-16.4] | 9.7 | 1 | $0.067 | $0.101 | -, 0/6 warm | 0 | - | - |
judge cost: $0.250 over 48 calls (not in $/run)

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
