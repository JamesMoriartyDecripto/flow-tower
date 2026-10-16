# Model benchmark results

Measured 2026-10-16 through OpenRouter (`require_parameters`, `data_collection: deny`, effort low).

## embeddings

2 tasks (docs-en, levers-it), 3+ runs each.

| Model | Runs | Correct | Total s, median [min-max] | First output s | Steps | $ / run | $ / correct | Cached %, warm starts | Retries | Errors | Providers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `qwen/qwen3-embedding-8b` | 6 | 6/6 | 1.4 [0.9-2.3] | 1.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | Nebius, DeepInfra |
| `google/gemini-embedding-2` | 6 | 6/6 | 1.1 [0.9-1.3] | 1.1 | 1 | $0.0001 | $0.0001 | -, 0/6 warm | 0 | - | Google AI Studio |
| `perplexity/pplx-embed-v1-0.6b` | 6 | 3/6 | 0.5 [0.4-0.8] | 0.5 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | Perplexity |
| `baai/bge-m3` | 6 | 3/6 | 1.3 [1.2-1.5] | 1.3 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | DeepInfra, Parasail |
| `intfloat/multilingual-e5-large` | 6 | 3/6 | 2.3 [1.7-3.7] | 2.3 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | DeepInfra |
| `openai/text-embedding-3-small` | 6 | 3/6 | 1.4 [1.1-3.2] | 1.4 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | OpenAI |
| `voyageai/voyage-4-lite` | 6 | 3/6 | 0.8 [0.5-1.1] | 0.8 | 1 | $0.0000 | $0.0000 | -, 0/6 warm | 0 | - | VoyageAI by MongoDB |
| `mistralai/mistral-embed-2312` | 6 | 3/6 | 0.9 [0.6-1.5] | 0.9 | 1 | $0.0000 | $0.0001 | -, 0/6 warm | 0 | - | Mistral |

Correct: deterministic check, plus a blind rubric score >= 7 where the task has a rubric. A warm start is a run whose first step already hit the cache (left by an earlier run): compare them with cold ones.
