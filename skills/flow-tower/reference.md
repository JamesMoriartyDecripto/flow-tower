# Flow Tower reference for the skill

## Schema cheat sheet

```yaml
version: 1
name: Research Agent                      # required
description: one paragraph
tags: [coding, claude-agent-sdk]
root: .                                   # base for every relative path (default: tower file dir)
runtimes:                                 # where things run
  laptop: { kind: local, label: Dev laptop }
  api:    { kind: container, host: vps-1, provider: hetzner, region: fsn1 }
  # kind: local | server | cloud | container | serverless | saas | edge | ci | browser | device
prompts:
  lead: { file: prompts/lead.md, description: Orchestrator system prompt }
agents:
  lead:
    name: Lead
    model: claude-opus-5-5
    prompt: lead                          # registry id, or { file: ... } / { text: ... }
    tools: [Agent, Read, mcp__github]
    harness: { max_turns: 30, permission_mode: default }   # free-form
    runtime: api
    files: [src/lead.ts]
    tower: towers/lead.tower.yaml         # nested tower (optional)
    match: ["agent:lead*"]                # live-event rules (optional)
  reviewer: { from: .claude/agents/reviewer.md }          # Claude Code subagent file
layers:                                   # top → bottom
  - id: orchestration                     # [A-Za-z0-9_-]
    title: Orchestration
    nodes:
      - { id: lead, agent: lead }         # type defaults to agent
      - id: gate
        type: decision                    # entry output agent process decision tool model memory human guard hook
        label: Tests pass?                # ≤ 18 chars
        description: "Runs npm test; max 3 fix rounds"
        status: active                    # active | planned | experimental | deprecated
        resources:
          - { kind: log, label: Test log, path: logs/test.log }     # log script dashboard endpoint config doc queue database repo recording other
    edges:
      - lead -> gate
      - "gate -> lead [return]: fail, max 3"
links:                                    # cross-layer, "layer.node"
  - orchestration.lead -> tools.github [call]
```

Operational fields (optional, on agents or nodes; nodes inherit from their agent). Add them only when the real system has them:

```yaml
      - id: alert
        type: entry
        trigger: { kind: cron, schedule: "0 9 * * 1-5", timezone: Europe/Rome, hours: "Mon-Fri 09:00-18:00" }  # manual cron webhook event queue chat email file
      - id: searcher
        agent: searcher
        fanout: { min: 3, max: 5, by: query complexity }     # or a number: 4; by: [store, locale] multiplies; from: [agent ids] picked from a queue
        budget: { usd: 2, turns: 30, on_exceed: pause }       # or amount + currency: EUR, per: run|item|month..., for: model|media; a list for several
        limits: { timeout: 10m, retries: 2, max_iterations: 3, rate: "100/24h" }   # rate: quotas, one or a list
        data: { sensitivity: pii, region: eu, retention: 30d, lawful_basis: consent }  # public internal confidential pii phi pci biometric secret; retention: none = memory only; retention_after: matter close; disclosure: [C2PA]
        evals: [{ name: pass@1, value: 0.82, target: 0.8 }, { name: Elo, value: 1240, unit: Elo, illustrative: true }]
        version: v4
        rollout: { strategy: staged, steps: [1, 5, 25, 100], guard: "crash-free < 99.5%" }   # all canary staged ab shadow blue-green rainbow; percent, metric, arms, sample, previous
        credentials: service                                 # service | author | user
        sandbox: { network: allowlist, allow: [api.github.com], filesystem: workspace }
        async: { mode: poll, interval: 10s }                 # long external jobs: poll | callback | both
        exactly_once: true                                   # payouts, filings: never repeated
      - id: oncall
        type: human
        approval: { by: on-call SRE, via: [Slack, email], actions: [approve, reject], timeout: 15m, on_timeout: escalate, escalate_to: SRE lead, when: "severity >= 2" }   # per: item, rounds: 2, relayed_by: agent; actions also dismiss takeover
        sla: 72h                                             # or { within: 5d, business: true, after: SDI rejection } / { before: release, external: true } / { by: 2026-12-31 }
      - id: risk
        type: decision
        decision: { output: binary, threshold: 0.8, confidence: true, model: risk-v3, fail: closed }   # binary choice score ranking; candidates: [...]
```

Run-wide `budget` / `limits` go at the top level of the tower. Agents can list `skills` and `disabled_tools`.

Edges (object form) can carry `protocol` (mcp a2a http grpc webhook queue event stdio email manual) with `version` and A2A `card`, `async: true` (fire-and-forget) and `group` (alternatives: exactly one edge of the group is taken). Durations: `250ms 90s 5m 72h 7d 2w 10y`. Rates: `100/24h`, `300/5m`.

Edge kinds: `flow` (default, sequence), `call` (synchronous tool/function), `spawn` (starts a subagent), `handoff` (transfers control), `return` (result or loop back), `data` (reads/writes memory, files, DB).

## What goes where

Full guide with examples: `docs/what-goes-where.md` in the flow-tower repo.

- **Layer** = one stage of the run or one supporting concern (tools, harness, memory, models). Stages top to bottom in run order, then concerns. 3–10 nodes; inside a layer the flow reads **left to right**. No empty or one-node layers.
- **Node** = one thing doing one step: agent, process, decision, tool / MCP server, model, store, human, guard, hook. Split when parts differ in timing, runtime, model, permissions or retries; merge what always runs together. On the node (not as extra nodes): `agent:` ref, `files` that prove it, `prompt`, `model`, `runtime`, `resources`, operations shown by code or config. Label ≤ 18 chars.
- **Edge** = what passes and how: `flow` (then), `call` (waits for an answer), `spawn` (starts a subagent), `handoff` (gives up control), `return` (result or loop back, label the cap), `data` (reads / writes a store). Label what travels or when. Object form for `protocol`, `async: true`, `group` (exactly one taken).
- **Link** = an edge between layers, in top-level `links` as `layer.node`. Never copy a node into another layer to draw an edge.
- **Nested tower** = the inside of one node, via `tower:` (on the node or its agent): a subsystem with > ~5 internal steps, its own layers, reuse, or separate ownership. The parent keeps one node (input, output, limits); the sub-tower holds the steps, from an `entry` to an `output`. Never draw the same steps in both. 2–3 steps stay in the parent.

## Layer playbook (top → bottom, keep only what exists)

| Layer | Typical nodes |
|---|---|
| Intake & Triage | entry points (CLI, webhook, cron, chat), router/classifier, policy checks |
| Orchestration | orchestrator/lead agent, planner, dispatcher, aggregator, human approval |
| Specialists | one node per subagent/worker, in execution order |
| Quality Loop | reviewers, verifiers, evaluators, decision + `[return]` with cap |
| Tools & MCP | one `tool` node per MCP server or tool family |
| Harness & Guardrails | hooks (`hook`), permission rules and validators (`guard`), budgets |
| Memory & Context | CLAUDE.md / memory files / DBs / vector stores (`memory`) |
| Models | one `model` node per model used, linked from agents with `[call]` |
| Deploy & Ops | CI jobs, schedulers, log sinks (only if relevant to the flow) |

## Services (no agents)

HTTP APIs, middleware chains and workers: one layer per surface (public API, admin API) plus shared ingress, data, jobs and CI layers. Nodes in **mount order**, except response wrappers (`res.json` interceptors), which run last. One `output` for rejections with labelled edges (`401`, `403`, `429`) from the guards; the error middleware as a `hook` feeding it. Full guide and example: `docs/what-goes-where.md` § Services without agents.

## Signals: where to look

| Framework | Search for | Maps to |
|---|---|---|
| Claude Code | `.claude/agents/*.md` (bodies, not only frontmatter), `.claude/commands/`, `.claude/skills/`, `CLAUDE.md`, `.mcp.json`, `.claude/settings.json` (`hooks`, `permissions`) | subagents via `from:`, tools/MCP, hooks, memory; `maxTurns` → `budget: { turns, on_exceed: stop }`; human gates → `approval` |
| Claude Code hooks | the hook script, not its name: exit code 2 or `permissionDecision: deny` (blocks), `ask` (asks), `additionalContext` (reminds), stderr with exit 0 (nobody sees it); its `matcher`; once per session or every call | `hook` nodes, one per matcher group, side by side (they are independent), the description saying which of the four it does |
| Claude Agent SDK | `query(` with `options.agents`, `mcpServers`, `hooks`, `allowedTools`, `model`, `maxTurns`, `createSdkMcpServer` | agents, tools, hooks, harness |
| Anthropic API loops | `messages.create`, `tool_use` handling, `while`/`for` loops around calls | agent + loop decision + tools |
| OpenAI Agents SDK | `Agent(name=, instructions=, tools=, handoffs=)`, `Runner.run` | agents, `[handoff]` edges |
| LangGraph | `StateGraph`, `add_node`, `add_edge`, `add_conditional_edges`, `interrupt` | nodes/edges directly; conditionals → decision; interrupt → human |
| CrewAI | `Agent(role=, goal=)`, `Task(`, `Crew(process=Process.sequential\|hierarchical)` | agents, task flow, manager agent |
| AutoGen / AG2 | `AssistantAgent`, `UserProxyAgent`, `GroupChat`, `GroupChatManager` | agents, human, orchestrator |
| Pi | `~/.pi/agent/extensions/`, `pi.on(`, session JSONL | agent + extensions as hooks |
| Hermes Agent | `~/.hermes/config.yaml` (`hooks`, `skills`, `tools`), `HOOK.yaml` | agent, hooks, tools |
| HTTP services | `app.use(` / `router.use(` in registration order, route-level middleware, error middleware `(err, req, res, next)`, `res.json =` wrappers, FastAPI `Depends` / middleware, cron, queue consumers | ingress guards, rejection `output` with labelled edges, error `hook`, jobs layer |
| Prompts | `prompts/`, `*.prompt.md`, `system_prompt =`, `instructions=` | `prompts:` registry |
| Runtimes | `Dockerfile`, `docker-compose*.yml`, `k8s/`, `.github/workflows/`, `vercel.json`, `serverless.yml`, `wrangler.toml`, crontab, README "deploy" | `runtimes:` |
| Resources | `logs/`, `*.log`, logger config, `scripts/`, Grafana/Datadog/Langfuse URLs in docs | `resources:` |

Useful searches (adapt to the repo):

```bash
rg -l "query\(|createSdkMcpServer|StateGraph|Crew\(|AssistantAgent|Agent\(name=" --type-add 'code:*.{ts,js,py}' -t code
rg -n "model\s*[:=]\s*['\"]" -t code | head -50
ls .claude/agents .claude/commands prompts 2>/dev/null; cat .mcp.json 2>/dev/null
```

## Node type decision

- **agent:** an LLM with its own prompt and loop.
- **process:** deterministic code step.
- **decision:** a branch, router, or loop condition.
- **tool:** a tool, MCP server or external API.
- **model:** an LLM model.
- **memory:** state, files, DB, cache.
- **human:** approval, review, input.
- **guard:** a policy, validator or permission rule.
- **hook:** a lifecycle hook.
- **entry / output:** where the flow starts / ends.

## Live matching tips

Events match nodes by agent name (`agent_type`, `subagent_type`, `child_role`) and by tool name (`tool_name`; MCP `mcp__<server>__<tool>` also matches a tool node named `<server>`). When names differ, add rules: `match: ["agent:code-reviewer", "tool:mcp__github__*", "source:github-actions&tool:deploy*"]`.
