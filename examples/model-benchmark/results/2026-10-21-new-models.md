# Model benchmark results

Measured 2026-10-21 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## cited-answer

2 tasks (ai-in-the-studio, cpb-choice), 3+ runs each. Only 1 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash-1017` | 6 | 6/6 | 4.9 [3.1-9.5] | 1.0 | 3 | $0.0005 | $0.0005 | 28%, 2/6 warm | 0 | - | InferenceNet, Reka, Relace |

## coder

3 tasks (format-price, parse-edge, shell-path), 3+ runs each. Only 1 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `minimax/minimax-m3.1-flash:free` | 9 | 8/9 | 14.4 [1.6-20.3] | 13.4 | 1 | $0.0000 | $0.0000 | 42%, 9/9 warm | 0 | - | Minimax |

## data

2 tasks (deadlines-email, invoice-fields), 3+ runs each. Only 2 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `minimax/minimax-m3.1-flash:free` | 6 | 6/6 | 1.7 [1.5-2.1] | 1.5 | 1 | $0.0000 | $0.0000 | 39%, 6/6 warm | 0 | - | Minimax |
| `inception/mercury-3` | 6 | 6/6 | 1.5 [1.0-2.1] | 1.4 | 1 | $0.0002 | $0.0002 | 0%, 1/6 warm | 0 | - | Inception |

## decision

2 tasks (abuse-labels, triage-routes), 3+ runs each. Only 2 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `perplexity/pplx-decider-v1.2` | 6 | 6/6 | 0.4 [0.4-0.6] | 0.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | Perplexity |
| `perplexity/pplx-decider-flash-v1.2` | 6 | 3/6 | 0.6 [0.5-0.8] | 0.6 | 1 | $0.0000 | $0.0001 | -, 0/6 warm | 0 | - | Perplexity |

## guard

3 tasks (airline-jailbreak, data-leak, injection), 3+ runs each. Only 1 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `inception/mercury-3` | 9 | 9/9 | 1.1 [0.6-1.8] | 1.1 | 1 | $0.0001 | $0.0001 | 1%, 3/9 warm | 0 | - | Inception |

## intent

4 tasks (airline-relevance, airline-routing, navigation, node-and-layer), 3+ runs each. Only 1 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `inception/mercury-3` | 12 | 11/12 | 1.2 [0.6-3.0] | 1.2 | 1 | $0.0001 | $0.0002 | 1%, 4/12 warm | 0 | - | Inception |

## orchestrator

2 tasks (release-plan, squad-plan), 3+ runs each. Only 2 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `minimax/minimax-m3.1-flash:free` | 6 | 6/6 | 1.8 [0.8-2.3] | 1.8 | 1 | $0.0000 | $0.0000 | 38%, 6/6 warm | 0 | - | Minimax |
| `inception/mercury-3` | 6 | 6/6 | 1.3 [1.0-2.0] | 1.3 | 1 | $0.0002 | $0.0002 | 1%, 2/6 warm | 0 | - | Inception |

## stt

2 tasks (en-france, it-deledda), 3+ runs each. Only 2 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mistralai/voxtral-mini-transcribe-3-0` | 6 | 6/6 | 1.0 [0.7-1.3] | 1.0 | 1 | $0.0013 | $0.0013 | -, 0/6 warm | 0 | - | - |
| `mistralai/voxtral-small-transcribe-3-0` | 6 | 6/6 | 1.0 [0.8-1.5] | 1.0 | 1 | $0.0015 | $0.0015 | -, 0/6 warm | 0 | - | - |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
