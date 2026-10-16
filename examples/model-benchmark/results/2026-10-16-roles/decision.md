# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## decision

2 tasks (abuse-labels, triage-routes), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `perplexity/pplx-decider-v1.1-27b` | 6 | 6/6 | 0.4 [0.3-0.5] | 0.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | Perplexity |
| `inception/mercury-decide` | 6 | 6/6 | 0.6 [0.5-1.2] | 0.6 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | Inception |
| `microsoft/microsoft-decision-1` | 6 | 6/6 | 0.4 [0.4-0.9] | 0.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | Azure |
| `nace-ai/drex-v2.0` | 6 | 6/6 | 0.7 [0.5-1.1] | 0.7 | 1 | $0.0001 | $0.0001 | -, 0/6 warm | 0 | - | DeepInfra |
| `liquid/d1` | 6 | 6/6 | 0.4 [0.3-0.7] | 0.4 | 1 | $0.0001 | $0.0001 | -, 0/6 warm | 0 | - | Liquid |
| `typesafe/jev-1.14` | 6 | 6/6 | 0.4 [0.3-0.8] | 0.4 | 1 | $0.0001 | $0.0001 | -, 0/6 warm | 0 | - | TypeSafe |
| `openai/gpt-6-luna-decisions` | 6 | 6/6 | 0.5 [0.3-0.6] | 0.5 | 1 | $0.0002 | $0.0002 | -, 0/6 warm | 0 | - | OpenAI |
| `cloudflare/clef-flash` | 6 | 0/6 | 0.4 [0.3-0.7] | 0.4 | 1 | $0.0000 | none correct | -, 0/6 warm | 0 | - | DeepInfra |
| `upstage/solar-decide-flash` | 6 | 0/6 | 1.0 [0.9-1.9] | 1.0 | 1 | $0.0003 | none correct | -, 0/6 warm | 0 | - | Upstage |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
