# Agent Council

A multi-expert deliberation council for complex decisions. A chat question becomes a brief, a coordinator selects 3–7 experts from a pool, and three structured rounds produce independent evaluations, critiques, and final positions. A synthesizer drafts an operational plan, a verifier audits it, and a short human gate approves the result. Designed for OpenRouter with per-role model optimisation.

## What it shows

- **Intake & Briefing** — a cheap briefer turns raw questions into structured briefs with a lightweight human gate.
- **Orchestration** — a coordinator moderates up to three rounds and selects only relevant experts per topic.
- **Council** — 7 domain experts in one layer; each evaluates, critiques, and settles in response to the coordinator, writing to shared eval memory.
- **Synthesis & Review** — synthesiser merges final positions; verifier checks consistency; a consensus decision allows unanimous, majority, or dissent outcomes, with a short human gate.
- **Per-role models on OpenRouter** — different providers for adversarial coverage and cost control.

## Run it

    node bin/flow-tower.js examples/agent-council

## Adapt it

**Models** — edit the agents in the tower YAML. Defaults use OpenRouter IDs.

| Role | Default model | Why |
|---|---|---|
| Briefer | `google/gemini-2.0-flash-001` | Fast, cheap extraction |
| Coordinator | `anthropic/claude-3.5-sonnet` | Reasoning, moderation, long context |
| Software / DevOps | `openai/gpt-4o` | Strong coding and infra reasoning |
| Security / Compliance / Legal | `anthropic/claude-3.5-sonnet` | Careful, regulatory-friendly |
| AI Research | `deepseek/deepseek-r1` | Deep reasoning on AI alignment |
| Synthesizer | `anthropic/claude-3.5-sonnet` | Merges positions into a coherent plan |
| Red Team | `meta-llama/llama-3.3-70b-instruct` | Different provider, adversarial angle |
| Verifier | `openai/gpt-4o-mini` | Cheap consistency check |

**Experts** — add or drop roles in the `agents:` registry and the `council` layer. Update the coordinator prompt so it knows the pool.

**Consensus** — the `consensus` decision node supports `unanimous`, `majority`, and `dissent`. Change `limits.max_iterations` on the node to adjust how many revision rounds the synthesiser gets when there is dissent.

## Notes

- Numbers marked *illustrative* are not measured.
- Budget and timeout caps protect against runaway deliberation.
- The briefer needs no tools: it only reformats the raw question. The approved brief lands in the Approved brief memory; the coordinator is the only writer in the workspace: it saves the brief, registers each expert's round output into the evals memory from the experts' `[return]` links, and notes unreliable experts in the audit log.
- Experts hold `[Read]` only: they read the brief and the other experts' outputs, and return their own per-round file through their `[return]` link to the coordinator, who registers it. For a question that needs public sources, add `WebSearch` to the experts it concerns: the council deliberately separates search from evaluation so confidential evals never ride an outbound channel.
- Per-round expert selection is advisory: it lives in the coordinator prompt, bounded by the run budget; the tower sets no hard cap on experts per round. The spawn links draw the whole pool in the diagram; only the experts the coordinator selects for the brief actually run.
- Running the tower sends the brief and every evaluation to the model vendors configured (OpenRouter routes to the providers listed in the model nodes). For confidential briefs, restrict the experts' `model` values to providers you approve.
- No expert agent runs a shell: experts are read-only and the coordinator registers outputs, so no sandbox is declared. The coordinator's `Write` is the only write grant in the workspace; in flow-tower file paths stay confined to the project root, and in your harness you can scope it further to the memory folder.
- A `brief-example.md` in `memory/` shows the expected brief format.

## Sources

- [council-of-agents](https://github.com/VineetKiragi/council-of-agents) (GitHub): anonymous multi-LLM deliberation with structured rounds and chairman synthesis.
- [Bayesian Dialectical Argumentation](https://arxiv.org/abs/2610.02005) (arXiv:2610.02005): calibrating council confidence from typed moves and per-agent reliability.
- [ViFA-Council](https://arxiv.org/abs/2609.13348) (arXiv:2609.13348): three-stage deliberation (generation → critique → consensus) across multiple LLM providers.
