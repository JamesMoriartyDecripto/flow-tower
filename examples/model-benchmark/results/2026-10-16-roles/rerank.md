# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## rerank

2 tasks (abuso-it, gotcha-en), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `voyageai/rerank-2.5` | 6 | 6/6 | 0.2 [0.2-0.3] | 0.2 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | VoyageAI by MongoDB |
| `qwen/qwen3-reranker-8b` | 6 | 6/6 | 0.3 [0.3-0.5] | 0.3 | 1 | $0.0002 | $0.0002 | -, 0/6 warm | 0 | - | Fireworks |
| `cohere/rerank-4-pro` | 6 | 6/6 | 0.2 [0.2-0.3] | 0.2 | 1 | $0.0025 | $0.0025 | -, 0/6 warm | 0 | - | Cohere |
| `voyageai/rerank-2.5-lite` | 6 | 3/6 | 0.3 [0.2-1.5] | 0.3 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | VoyageAI by MongoDB |
| `cohere/rerank-4-fast` | 6 | 3/6 | 0.3 [0.2-0.5] | 0.3 | 1 | $0.0020 | $0.0040 | -, 0/6 warm | 0 | - | Cohere |
| `nvidia/llama-nemotron-rerank-vl-1b-v2:free` | 6 | 0/6 | 0.0 [0.0-0.6] | - | 1 | $0.0000 | none correct | -, 0/6 warm | 0 | HTTP 404 {"error":{"message":"No endpoin | - |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
