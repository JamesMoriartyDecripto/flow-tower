# Candidates

How the shortlist per category is built. Prices and capabilities come from OpenRouter's public models list (no key): `node skills/flow-tower-costs/models.mjs [regex] --tools --since <date>` in the Flow Tower repository.

## Filters, in this order

1. **Capabilities the role needs.** Tools for every loop category (coder, reviewer, security, lead, voice agent); structured output for intent; image input for vision; context length for long context.
2. **Data policy before price.** Every run sends `provider: { require_parameters: true, data_collection: 'deny' }` (and zero data retention where the account enforces it). Apply it while shortlisting: a model whose only endpoints log prompts is not a candidate, however cheap.
3. **An endpoint that exists.** A listed model can still have no endpoint that honours the parameters above with tools. A one-run smoke test catches it (HTTP 404 "No endpoints found"); record it as a result, as #70 did for qwen3.8-flash.
4. **Price band.** The cost of a run, not the price per token: a cheap model that takes 3x the steps costs more.
5. **Families.** At least one candidate from another provider family than the current default, and than the reviewer of its output (a reviewer from the coder's family shares its blind spots).

## Shortlist used on 2026-10-11

The same 8 models, 7 families, in all five categories run (intent, doc-writer, coder, reviewer, security). Results: [results/2026-10-11.md](results/2026-10-11.md).

| Model | Why it was in |
|---|---|
| `deepseek/deepseek-v4.1-flash` | squad coder and security default before this run (#70) |
| `deepseek/deepseek-v4-pro` | #70's first coder: the stronger tier of the same family |
| `z-ai/glm-5.3-flashx` | squad reviewer default (glm-5.3 timed out in #70) |
| `google/gemini-3.5-flash-lite` | voice agent default: fastest first sentence on 2026-10-10 |
| `anthropic/claude-haiku-5.5` | second in the voice test; Anthropic family |
| `openai/gpt-6-luna` | voice test; OpenAI family, low price |
| `inception/mercury-2.5` | lowest token price in the voice test; Inception family |
| `qwen/qwen3.7-flash` | Alibaba family (qwen3.8-flash had no endpoint under the data policy in #70) |

Use the exact ids `models.mjs` prints (`vendor/model`) on the day of the run: ids and prices change, and the date goes in the results.
