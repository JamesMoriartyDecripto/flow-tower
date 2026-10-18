# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## video-gen (ILLUSTRATIVE: fewer than 3 runs per model and task)

2 tasks (paper-boat, rolling-ball), 1+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `x-ai/grok-imagine-video-1.5-lite` | 2 | 2/2 | 25.9 [24.9-26.9] | - | 1 | $0.100 | $0.100 | -, 0/2 warm | 0 | - | - |
| `google/veo-3.1-lite` | 2 | 2/2 | 36.0 [35.2-36.9] | - | 1 | $0.120 | $0.120 | -, 0/2 warm | 0 | - | - |
| `bytedance/seedance-2.0-mini` | 2 | 2/2 | 85.5 [81.3-89.8] | - | 1 | $0.177 | $0.177 | -, 0/2 warm | 0 | - | - |
| `alibaba/wan-3.0` | 2 | 2/2 | 120.8 [110.3-131.4] | - | 1 | $0.212 | $0.212 | -, 0/2 warm | 0 | - | - |
| `minimax/hailuo-3-max` | 2 | 2/2 | 63.5 [16.2-110.8] | - | 1 | $0.250 | $0.250 | -, 0/2 warm | 0 | - | - |
| `kwaivgi/kling-v3.0-std` | 2 | 2/2 | 229.1 [99.7-358.6] | - | 1 | $0.420 | $0.420 | -, 0/2 warm | 0 | - | - |
| `runway/gen-4.5` | 2 | 2/2 | 96.3 [88.8-103.7] | - | 1 | $0.600 | $0.600 | -, 0/2 warm | 0 | - | - |
judge cost: $0.016 over 14 calls (not in $/run)

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
