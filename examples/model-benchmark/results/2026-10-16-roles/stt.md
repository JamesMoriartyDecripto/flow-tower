# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## stt

2 tasks (en-france, it-deledda), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `qwen/qwen3-asr-1.7b` | 6 | 6/6 | 22.5 [8.7-33.7] | 22.5 | 1 | $0.0002 | $0.0002 | -, 0/6 warm | 0 | - | - |
| `x-ai/grok-stt-1.0` | 6 | 6/6 | 1.4 [1.3-2.2] | 1.4 | 1 | $0.0006 | $0.0006 | -, 0/6 warm | 0 | - | - |
| `microsoft/mai-transcribe-2` | 6 | 6/6 | 1.0 [0.8-1.4] | 1.0 | 1 | $0.0007 | $0.0007 | -, 0/6 warm | 0 | - | - |
| `elevenlabs/scribe-v2` | 6 | 6/6 | 1.6 [1.1-2.1] | 1.6 | 1 | $0.0007 | $0.0007 | -, 0/6 warm | 0 | - | - |
| `meta/muse-voice-transcribe-1.0` | 6 | 6/6 | 5.2 [4.4-6.2] | 5.2 | 1 | $0.0012 | $0.0012 | -, 0/6 warm | 0 | - | - |
| `deepgram/nova-3` | 6 | 6/6 | 1.8 [1.4-2.3] | 1.8 | 1 | $0.0017 | $0.0017 | -, 0/6 warm | 0 | - | - |
| `assemblyai/universal-3-5-pro` | 6 | 6/6 | 1.3 [0.9-2.0] | 1.3 | 1 | $0.0019 | $0.0019 | -, 0/6 warm | 0 | - | - |
| `fish-audio/transcribe-1` | 6 | 6/6 | 1.2 [1.0-1.4] | 1.2 | 1 | $0.0023 | $0.0023 | -, 0/6 warm | 0 | - | - |
| `nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b` | 6 | 3/6 | 4.0 [2.2-24.4] | 4.0 | 1 | $0.0001 | $0.0002 | -, 0/6 warm | 0 | - | - |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
