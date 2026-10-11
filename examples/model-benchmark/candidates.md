# Candidates

How the shortlist per category is built. Prices and capabilities come from OpenRouter's public models list (no key): `node skills/flow-tower-costs/models.mjs [regex] --tools --since <date>` in the Flow Tower repository.

## Filters, in this order

1. **Capabilities the role needs.** Tools for every loop category (coder, reviewer, security, lead, voice agent); structured output for intent; image input for vision; context length for long context.
2. **Data policy before price.** Every run sends `provider: { require_parameters: true, data_collection: 'deny' }` (and zero data retention where the account enforces it). Apply it while shortlisting: a model whose only endpoints log prompts is not a candidate, however cheap.
3. **An endpoint that exists.** A listed model can still have no endpoint that honours the parameters above with tools. A one-run smoke test catches it (HTTP 404 "No endpoints found"); record it as a result, as #70 did for qwen3.8-flash.
4. **Price band.** The cost of a run, not the price per token: a cheap model that takes 3x the steps costs more.
5. **Families.** At least one candidate from another provider family than the current default, and than the reviewer of its output (a reviewer from the coder's family shares its blind spots).

## Starting shortlist

From the field results in `skills/flow-tower-costs/reference.md` (2026-10-10, one run each: illustrative), the models already seen in each role:

| Category | Seen so far | Add before running |
|---|---|---|
| voice / chat agent | gemini-3.5-flash-lite, claude-haiku-5.5, gemini-3.1-flash-lite, mercury-2.5, gpt-6-luna (qwen3.8-flash: no endpoint) | none needed: 5 measured; rerun with n ≥ 3 |
| coder | deepseek-v4-pro, deepseek-v4.1-flash | 3 more with tools, from 3 families |
| reviewer | glm-5.3 (timed out), glm-5.3-flashx | 3 more, none from the coder's family |
| security | deepseek-v4.1-flash | 4 more |
| intent, doc-writer, others | none | 5 from `models.mjs` |

Use the exact ids `models.mjs` prints (`vendor/model`) on the day of the run: ids and prices change, and the date goes in the results.
