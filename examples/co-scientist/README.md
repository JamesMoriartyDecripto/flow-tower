# AI Co-Scientist

Google's **AI co-scientist** as a tower: a multi-agent system built on **Gemini** that
acts as a virtual scientific collaborator. A scientist's research goal is safety-checked
and parsed into a research plan, which the scientist approves. A Supervisor then runs
an asynchronous worker queue of specialised agents (Generation, Reflection, Ranking
via an Elo tournament, Evolution, Proximity and Meta-review) in a self-improving loop
that runs for hours to days, with the scientist able to steer at any time.

The real system is not open source. The roles, review types, evolution strategies,
Elo start of 1200, context memory and evaluation numbers follow the paper and Google's
pages; the Python under `src/` is a short **reconstruction** of the same design with
the `google-genai` SDK, meant to be read, not run.

```bash
npx flow-tower examples/co-scientist/co-scientist.tower.yaml
```

The **Elo tournament** node drills down into `towers/tournament.tower.yaml`.

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Scientist in the Loop | goal, goal safety guard, plan parser, plan approval, ongoing scientist input |
| 2 | Supervisor & Worker Queue | statistics → agent weights → task queue → worker pool, terminal check, context memory |
| 3 | Generate & Review | generation, hypothesis safety, initial review, deep reviews, hypothesis pool |
| 4 | Tournament & Evolution | proximity graph, Elo tournament, evolution, meta-review, prompt feedback |
| 5 | Tools, Models & Outputs | Google Search, domain databases, private papers, AlphaFold, Gemini, research overview, wet-lab validation |

## Operational fields used

| Field | Where |
|---|---|
| `trigger` | goal (`chat`), every specialised agent (`queue`, from the supervisor) |
| `approval` | scientist approves or edits the research plan; scientist input (`respond`, `edit`) |
| `limits` | supervisor `ttl: 72h`, `max_iterations: 400`, `concurrency: 32`; worker timeout and retry; debate turns |
| `fanout` | worker pool `{ min: 8, max: 32, by: supervisor weights and budget }` |
| `budget` | supervisor token budget, `on_exceed: pause` |
| `data` | confidential goals and state, 180-day retention for snapshots |
| `credentials` | domain databases on a service account; private papers on the user's grant |
| `evals` | adversarial goals blocked, GPQA top-1 of the top-Elo answer, top Elo, expert preference rank, novelty, impact |
| `sla` | wet-lab validation (illustrative 12 weeks) |
| edge `protocol: queue` | weights → task queue → workers |

Eval **values** marked "paper" come from the paper (78.4% GPQA diamond top-1 for the
top-Elo answer; expert preference rank 2.36 across 11 goals; novelty 3.64 and impact
3.09 of 5; 1,200 adversarial goals rejected). Every **target**, the run limits
(72h TTL, 400 cycles, 32 workers), budgets and the top-Elo value are illustrative.
The paper names "Gemini 2.0" without a variant; `gemini-2.0-flash` is a placeholder id.

## Sources

- Google Cloud, *Co-Scientist and AlphaEvolve* (Gemini Enterprise): agent roles, Elo-based tournament, proximity graph, meta-review roadmap, supervisor work queue, restricted access. https://docs.cloud.google.com/gemini/enterprise/docs/co-scientist-and-alphaevolve
- Google Research blog, *Accelerating scientific breakthroughs with an AI co-scientist*: supervisor and worker queue, test-time compute, Elo vs GPQA, scientist feedback and own ideas, AML / liver fibrosis / cf-PICI validations. https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/
- Gottweis et al., *Towards an AI co-scientist* (arXiv 2502.18864): research plan configuration, asynchronous task framework, context memory and restarts, Elo 1200, debate vs single-turn matches, six review types, evolution strategies, safety evaluation, NIH Specific Aims output. https://arxiv.org/abs/2502.18864 (HTML: https://arxiv.org/html/2502.18864v1)

## Layout

```
prompts/   goal-parser, supervisor, generation, reflection, ranking, evolution, proximity, meta-review, safety
src/       research_session.py (entry, resume), supervisor_loop.py (queue + workers), specialists.py,
           elo_tournament.py, proximity_graph.py, context_memory.py, cosci_llm.py (Gemini), prompt_fill.py
config/    research_plan.yaml, agent_weights.yaml
logs/      supervisor.log, tournament.log        outputs/  specific-aims-example.md
towers/    tournament.tower.yaml
```
