---
name: flow-tower-costs
description: Reduce, optimize or compare the model cost and latency of an agentic system mapped in a Flow Tower (`*.tower.yaml`). Use when the user asks to cut LLM spend or latency of an agent or multi-agent system / tower, pick cheaper or faster models per role, compare model prices, or benchmark models on the system's real tasks.
---

# Flow Tower: optimize model cost and latency

Pick the cheapest model per role **that still does the job**, measured on the system's real cases. CLI: `{{FLOW_TOWER_CLI}}` (see the [flow-tower skill](../flow-tower/SKILL.md) for setup). Details: [reference.md](reference.md).

## Checklist

1. **Inventory** from the tower (and the code): every node/agent with `model`, `runtime`, `budget`, `limits`, `evals`, harness effort / `max_turns`; live events with cost if the tower is wired ([docs/realtime.md](../../docs/realtime.md)). `{{FLOW_TOWER_CLI}} validate <tower> --json` for counts. Per role, note what it needs: tools, structured output, latency-bound (voice/UI) or batchable (one turn, its whole input can be packed into the request), reasoning depth, languages, data policy (zero data retention).
2. **Current prices**: `node <skill>/models.mjs [filter] [--tools] [--since YYYY-MM-DD]` (OpenRouter's public models list, no key): input/output/cached-input price, tool support, context, release date.
3. **Shortlist** 3–5 candidates per role with the same capabilities and data policy. Cheaper is not enough.
4. **Benchmark on real cases**, not on price: same inputs through the real loop (the app's own tool loop; a throwaway server per model if the model is an env setting). Measure time to first useful output, correctness against what the code/tower says, steps, cost per run, failures ([recipe](reference.md#benchmark-recipe)). One run is illustrative: say so.
5. **Ask the pace**: how urgent is this work? It decides the mode per role, not the model.
   - **No hurry**: every batchable role goes through a batch API (about half price, results within 24 h, median minutes). A model without a batch endpoint falls back to one synchronous request. Delete each batch once read.
   - **In a hurry**: synchronous calls; a large packed input as one request rather than a tool loop that re-sends a growing context.
   - **Never batched**: roles that need tools across turns (a coder, an agent that reads files). Keep their cost down with the other levers.
   Rule and field numbers: [reference.md § Levers](reference.md#levers) (Batch, Pace); a working example: the repo's squad (`SQUAD_PACE=relaxed`, [tools/squad § Pace](../../tools/squad/README.md#pace-how-fast-versus-how-cheap)).
6. **Levers** beyond swapping the model: caching, reasoning effort, step caps, escalation, fewer turns ([reference.md § Levers](reference.md#levers)).
7. **Decide per role and record it**: model nodes with price + date, the pace each role runs at (batch or sync), `budget`, `evals` with the measured numbers labelled illustrative, an options page with the benchmark table, the changelog. Keep `FLOW_TOWER_*`-style env overrides so users can switch back.
8. **Report**: before/after cost and latency per role, and the pace chosen (what batching saves and what it costs in wait); what was measured vs assumed.

## Never

- Pick a model on price alone ([field results](reference.md#field-results): the cheapest were the slowest or failed).
- Break the data policy (ZDR, `data_collection: 'deny'`) to save money.
- Invent numbers: unmeasured means "assumed", and say so.
- Batch a step that needs tools, or send secrets through a batch API (providers keep batch inputs up to 30 days unless deleted).
- Put API keys, tokens or dotenv values in towers, scripts, logs or output.
