# Best practices for agentic systems

Practices for building a tower that works in production, each tied to a check. A rule `AUDnn` is deterministic:
`flow-tower audit <tower>` reports it on the node it applies to (`src/core/audit.ts`). A **rubric** item cannot be
checked by code: the pattern review of the [tower optimizer](../examples/tower-optimizer/README.md) judges it, citing
the node and this page. The docs and the checks stay in sync through the rule ids: a new practice gets a rule or a
rubric line, never neither.

Sources were fetched on 2026-10-12. Quotes are short and verbatim; a practice backed by engineering judgement rather
than a source says so.

## Rules (`flow-tower audit`)

| Rule | Practice | Level |
|---|---|---|
| [AUD01](#aud01) | A loop has a stopping condition | warning |
| [AUD02](#aud02) | An orchestrator has a cap on workers | warning |
| [AUD03](#aud03) | An irreversible action has a human gate | warning |
| [AUD04](#aud04) | A decision has a fallback | warning |
| [AUD05](#aud05) | A generated output has evals | info |
| [AUD06](#aud06) | One agent, one job | info |
| [AUD07](#aud07) | No dead ends | info |
| [AUD08](#aud08) | Nest only as deep as useful | info |
| [AUD09](#aud09) | Every agent names its model | info |
| [AUD10](#aud10) | The whole system has a budget | info |
| [AUD11](#aud11) | Code execution runs in a sandbox | warning |

### AUD01

**A loop has a stopping condition.** An agent that can call itself, or agents that hand work back and forth, need
`limits` (`max_iterations`, `timeout`) or a `budget`, on the node or for the whole tower.

- Anthropic: "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control." [S1]
- OpenAI lists among exit conditions "reaching a maximum number of turns." [S5]
- Microsoft: "Set an iteration cap to prevent infinite refinement loops, and define fallback behavior for when the cap is reached." [S8]

### AUD02

**An orchestrator has a cap on workers.** A node that fans out or spawns several workers needs `limits` (concurrency,
workers per run). Effort should scale with the task.

- Anthropic: "Early agents made errors like spawning 50 subagents for simple queries." [S2]
- Microsoft: "consider limiting group chat orchestration to three or fewer agents." [S8]

### AUD03

**An irreversible action has a human gate.** Payments, filings, sends, deploys and deletes (`exactly_once`, `pci` or
`secret` data, the end user's credentials) need `approval`, or a `human` node right before them.

- OWASP: "Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken." [S6]
- OpenAI rates tools by risk (read-only or write, reversibility, financial impact) and pauses or escalates on high-risk actions. [S5]

### AUD04

**A decision has a fallback.** A `decision` node has at least two ways out, and, when it declares a typed `decision`,
what happens on an error or low confidence (`fail: open` or `fail: closed`).

- Microsoft: "define fallback behavior for when the cap is reached." [S8]
- OpenAI escalates to a human when failure thresholds are crossed. [S5]
- The `fail: open | closed` policy itself is engineering judgement: no source names it for LLM routers.

### AUD05

**A generated output has evals.** An agent whose result goes straight to an `output` has `evals`, or a `guard` in
between. Start from real cases; calibrate an LLM judge against people.

- Anthropic: "We started with a set of about 20 queries representing real usage patterns." [S2]
- Anthropic: "Building an evaluation allows you to systematically measure the performance of your tools." [S3]
- Zheng et al.: "strong LLM judges like GPT-4 can match both controlled and crowdsourced human preferences well", and the
  same paper documents position, verbosity and self-preference bias. [S10]

### AUD06

**One agent, one job.** More than 15 tools on one node usually means several jobs: split it into focused agents.

- Anthropic: "Too many tools or overlapping tools can also distract agents from pursuing efficient strategies." [S3]
- Anthropic: "specialized sub-agents can handle focused tasks with clean context windows". [S4]
- OWASP: "Limit the extensions that LLM agents are allowed to call to only the minimum necessary." [S6]
- The threshold (15) is engineering judgement.

### AUD07

**No dead ends.** Every working node leads somewhere: a result, an error path, a human. A node with no way out is where
failures disappear.

- Cemri et al. build a failure taxonomy of multi-agent systems (MAST); unhandled verification and termination are among
  its failure modes. [S7]
- Anthropic: "Adding full production tracing let us diagnose why agents failed and fix issues systematically." [S2]
- The rule itself is engineering judgement.

### AUD08

**Nest only as deep as useful.** Each level of sub-towers adds coordination, latency and cost; more than three levels
is reported.

- Microsoft: "Use the lowest level of complexity that reliably meets your requirements." [S8]
- Anthropic: "we recommend finding the simplest solution possible, and only increasing complexity when needed." [S1]

### AUD09

**Every agent names its model.** A model written in the tower makes cost, evals and benchmarks reproducible and lets
the optimizer suggest a cheaper one per role.

- OpenAI: "try swapping in smaller models to see if they still achieve acceptable results." [S5] Swapping needs a
  known starting point.
- Pinning as such is engineering judgement: no source states it.

### AUD10

**The whole system has a budget.** A tower with three or more agents sets a run-wide `budget` or `limits`, so one
runaway node cannot spend for all.

- Stopping conditions [S1] and failure thresholds [S5] apply to the system as a whole; a cost cap per run is
  engineering judgement.

### AUD11

**Code execution runs in a sandbox.** A node with a shell or code tool declares a `sandbox` (filesystem and network).

- Anthropic: "effective sandboxing requires both filesystem and network isolation." [S9]
- Anthropic: "extensive testing in sandboxed environments, along with the appropriate guardrails." [S1]
- OWASP: "Limit the permissions that LLM extensions are granted to other systems to the minimum necessary" [S6]

## Rubric (pattern review)

The optimizer's review answers each line with a node, the YAML it quotes, and a source from this page.

1. **The simplest pattern that works.** Prompt chaining, routing, parallelization, orchestrator-workers,
   evaluator-optimizer, an autonomous agent: is the flow the simplest one that meets the need? [S1] [S8]
2. **The right model per role.** Start with a capable model to set a baseline, then try smaller ones per role and keep
   them where evals hold. [S5] Latency-bound roles (voice, UI) are chosen on speed first; this is engineering judgement.
   The role classes and categories are in [the model fit](#model-fit).
3. **Tools hard to misuse.** "Poka-yoke your tools. Change the arguments so that it is harder to make mistakes." [S1]
   Clear names and descriptions: "Even small refinements to tool descriptions can yield dramatic improvements." [S3]
4. **Context kept small.** "find the smallest set of high-signal tokens that maximize the likelihood of your desired
   outcome" [S4]
5. **Traced.** Live events or logs on every agent, so failures can be found. [S2]
6. **Reason, then act.** Agents that interleave reasoning and tool use handle exceptions better. [S11]
7. **Risks managed as a whole.** Map, measure and manage the system's risks, not only its nodes. [S12]

## Model fit

`flow-tower audit` classifies each agent's role from facts in the tower (node type, model id, tools, spawn edges, then
words in its id, label and description) and lists what the role needs and the OpenRouter categories to shortlist from
(`src/core/roles.ts`). OpenRouter categories seen on [openrouter.ai/models](https://openrouter.ai/models) on 2026-10-12:
academia, finance, health, legal, marketing, programming, roleplay, seo, translation, trivia; modality filters: text,
image, video, speech, embeddings, rerank, transcription, audio. Shortlist with
`skills/flow-tower-costs/models.mjs`, then benchmark on the project's own cases with
[model-benchmark](../examples/model-benchmark/README.md).

## Sources

- [S1] Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), 2024-12-19.
- [S2] Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), 2025-06-13.
- [S3] Anthropic, [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), 2025-09-11.
- [S4] Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29.
- [S5] OpenAI, [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf), 2025 (PDF).
- [S6] OWASP GenAI, [LLM06:2025 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), 2025.
- [S7] Cemri et al., [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657), arXiv:2503.13657, 2025.
- [S8] Microsoft Learn, [AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), 2026-02-12.
- [S9] Anthropic, [Making Claude Code more secure and autonomous with sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing), 2025-10-20.
- [S10] Zheng et al., [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685), arXiv:2306.05685, 2023.
- [S11] Yao et al., [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629), arXiv:2210.03629, 2022.
- [S12] NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), 2023, and its Generative AI Profile, 2024.
