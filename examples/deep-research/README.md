# Deep Research Team

An analyst-grade **deep research** system on the Claude API (Python). A question is
clarified and turned into a brief. An Opus lead researcher plans, saves the plan to
memory and fans out parallel Sonnet search subagents, scaling effort to the query.
Findings are compressed, written up, attributed by a CitationAgent and audited by a
fresh-context verifier.

This is a reference example: it is meant to be read, not run.

```bash
npx flow-tower examples/deep-research/deep-research.tower.yaml
```

The **Searcher** node drills down into `towers/searcher.tower.yaml`.

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Intake & Clarify | chat trigger, one optional clarifying question, brief + query class |
| 2 | Lead Researcher | Opus lead, plan memory, `conduct_research` fan-out, `think`, round cap, checkpoints, run budget |
| 3 | Search Subagents | 1-10 parallel searchers, web search/fetch server tools, Drive and Confluence MCP, page summarizer, artifact store, compressor |
| 4 | Write, Cite & Verify | writer, CitationAgent, verifier, max 2 revise rounds, cited report, analyst rating |
| 5 | Evals & Operations | LLM judge, Deep Research Bench, human review, tracing, rainbow deploy, models |

## Operational fields used

| Field | Where |
|---|---|
| `trigger` (chat) | `intake.question` |
| `approval` | clarifying question (`respond`), weekly human review |
| `fanout` `{ min: 1, max: 10, by: query complexity }` | `search.searcher`; 3-5 parallel tool calls inside the sub-tower |
| `budget` | lead ($12/run), searcher ($1.5, 15 turns) |
| `limits` | lead `max_iterations: 6`, `concurrency: 5`; searcher `max_iterations: 10`, retries + backoff; verify `max_iterations: 2` |
| `data` | confidential questions and artifacts, 30-day retention |
| `credentials: user`, `sandbox` | MCP calls run on the analyst's OAuth grant; searchers reach only the MCP gateway |
| `evals` | judge rubric, citation coverage, RACE score, searcher latency. **All values are illustrative targets**, not measured results |
| `version`, `rollout` (rainbow) | `ops.rollout`, see `deploy/rainbow.yaml` |
| `sla` | human review within 7 days |
| edge `protocol: mcp` | searcher to Drive and Confluence |

## Sources

- Anthropic, *How we built our multi-agent research system*: lead/subagent split, plan saved to memory, effort scaling (1 / 2-4 / 10+ subagents), 3-5 parallel subagents with 3+ parallel tool calls, CitationAgent, LLM-as-judge rubric, human eval, checkpoints, tracing, rainbow deployments. https://www.anthropic.com/engineering/multi-agent-research-system
- LangChain, `open_deep_research`: clarify → research brief → supervisor/researcher subgraphs → compress → final report; defaults `max_concurrent_research_units=5`, `max_researcher_iterations=6`, `max_react_tool_calls=10`, page summarization over 50k chars, compression retries; Deep Research Bench RACE 0.4344. https://github.com/langchain-ai/open_deep_research (and `src/open_deep_research/configuration.py`, `deep_researcher.py`)
- OpenAI Agents SDK, financial research agent: planner → search → writer → verifier that audits for inconsistencies and missing sourcing. https://raw.githubusercontent.com/openai/openai-agents-python/main/examples/financial_research_agent/README.md

## Layout

```
prompts/   clarify, brief, lead, searcher, compress, writer, citation agent, verifier, judge
src/       research_pipeline.py (entry), lead.py, searcher.py, compress.py, cite.py, verify_loop.py,
           plan_store.py, client_tools.py (MCP), config.py, evals/judge.py
config/    mcp.json          deploy/  rainbow.yaml
evals/     queries.jsonl     memory/  plan-example.json      logs/  lead.log, searchers.log
towers/    searcher.tower.yaml
```
