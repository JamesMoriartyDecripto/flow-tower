# Results: ILLUSTRATIVE example

**ILLUSTRATIVE: invented numbers that show the format `report.mjs` writes. Not a measurement.** Real tables go in `results/<date>.md` and, once signed off, in `skills/flow-tower-costs/reference.md`.

# Model benchmark results

Measured 2026-10-11 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## reviewer (ILLUSTRATIVE: fewer than 3 runs per model and task)

2 tasks (events-204, store-mutation), 2+ runs each. Only 3 models: the goal is at least 5.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `vendor-a/model-small` | 4 | 4/4 | 9.8 [7.1-14.2] | 1.9 | 3 | $0.0021 | $0.0021 | 41%, 2/4 warm | 0 | - | ProviderX |
| `vendor-b/model-flash` | 4 | 3/4 | 6.2 [5.0-8.8] | 1.1 | 2 | $0.0009 | $0.0012 | 38%, 2/4 warm | 0 | - | ProviderY |
| `vendor-c/model-mini` | 4 | 0/4 | 180.0 [180.0-180.0] | - | 0 | $0.0000 | none correct | -, 0/4 warm | 4 | HTTP 404 No endpoints found that support | - |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.

## How to read it

- **Correct** first, then **$ / correct**: it counts failed runs too, so a cheap model that fails half the time costs double.
- The **[min-max]** spread with 2 runs is noise: rerun with `--runs 5` before choosing between rows this close.
- `vendor-c` never ran: no endpoint honours `require_parameters` + `data_collection: deny` with tools. That is a result for the skill ("not available under our data policy"), not a model failure.
