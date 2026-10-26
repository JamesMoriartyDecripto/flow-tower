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
| Red Team | `meta-llama/llama-3.3-70b-instruct` | Different provider, adversarial angle |
| Verifier | `openai/gpt-4o-mini` | Cheap consistency check |

**Experts** — add or drop roles in the `agents:` registry and the `council` layer. Update the coordinator prompt so it knows the pool.

**Consensus** — the `consensus` decision node supports `unanimous`, `majority`, and `dissent`. Change `limits.max_iterations` on the node to adjust how many revision rounds the synthesiser gets when there is dissent.

## Notes

- Numbers marked *illustrative* are not measured.
- Budget and timeout caps protect against runaway deliberation.
- A `brief-example.md` in `memory/` shows the expected brief format.

## Sources

- [council-of-agents](https://github.com/VineetKiragi/council-of-agents) (GitHub): anonymous multi-LLM deliberation with structured rounds and chairman synthesis.
- [Bayesian Dialectical Argumentation](https://arxiv.org/abs/2610.02005) (arXiv:2610.02005): calibrating council confidence from typed moves and per-agent reliability.
- [ViFA-Council](https://arxiv.org/abs/2609.13348) (arXiv:2609.13348): three-stage deliberation (generation → critique → consensus) across multiple LLM providers.
