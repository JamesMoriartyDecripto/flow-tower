# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## tts

2 tasks (en-status, it-scadenza), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash-tts` | 6 | 6/6 | 4.2 [3.7-4.5] | 4.2 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `hexgrad/kokoro-82m` | 6 | 6/6 | 1.3 [1.0-3.6] | 1.3 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `elevenlabs/eleven-v4-turbo` | 6 | 6/6 | 1.2 [1.0-1.3] | 1.2 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `fish-audio/drama-3` | 6 | 6/6 | 1.7 [1.3-1.9] | 1.7 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `x-ai/grok-voice-tts-1.0` | 6 | 6/6 | 1.3 [1.1-1.7] | 1.3 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `microsoft/mai-voice-2.1-flash` | 6 | 6/6 | 0.9 [0.8-1.1] | 0.9 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `bytedance-seed/seed-audio-1-0` | 6 | 6/6 | 19.0 [13.4-25.9] | 19.0 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `minimax/speech-2.8-turbo` | 6 | 6/6 | 1.4 [1.2-1.8] | 1.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `qwen/qwen-audio-3.0-tts-flash` | 6 | 5/6 (1 unscored) | 2.4 [1.9-2.8] | 2.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
| `deepgram/aura-2` | 6 | 4/6 | 3.8 [2.7-4.4] | 3.8 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | - |
judge cost: $0.046 over 60 calls (not in $/run)

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
