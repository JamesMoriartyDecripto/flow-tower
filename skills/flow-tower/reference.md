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
        trigger: { kind: webhook, source: PagerDuty }        # manual cron webhook event queue chat email file; cron: schedule: "0 9 * * 1-5"
      - id: searcher
        agent: searcher
        fanout: { min: 3, max: 5, by: query complexity }     # or a number: 4
        budget: { usd: 2, turns: 30, on_exceed: pause }
        limits: { timeout: 10m, retries: 2, max_iterations: 3 }
        data: { sensitivity: pii, region: eu, retention: 30d }  # public internal confidential pii phi pci secret
        evals: [{ name: pass@1, value: 0.82, target: 0.8 }]
        version: v4
        rollout: { strategy: canary, percent: 10, previous: v3 }
        credentials: service                                 # service | author | user
        sandbox: { network: allowlist, allow: [api.github.com], filesystem: workspace }
      - id: oncall
        type: human
        approval: { by: on-call SRE, via: Slack, actions: [approve, reject], timeout: 15m, on_timeout: escalate }
        sla: 72h
```

Edges can carry a wire protocol: `{ from: concierge, to: seller, kind: call, protocol: a2a }` (mcp a2a http grpc webhook queue event stdio). Durations: `250ms 90s 5m 72h 7d 2w`.

Edge kinds: `flow` (default, sequence), `call` (synchronous tool/function), `spawn` (starts a subagent), `handoff` (transfers control), `return` (result or loop back), `data` (reads/writes memory, files, DB).

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

## Signals: where to look

| Framework | Search for | Maps to |
|---|---|---|
| Claude Code | `.claude/agents/*.md`, `.claude/commands/`, `.claude/skills/`, `CLAUDE.md`, `.mcp.json`, `.claude/settings.json` (`hooks`, `permissions`) | subagents via `from:`, tools/MCP, hooks, memory |
| Claude Agent SDK | `query(` with `options.agents`, `mcpServers`, `hooks`, `allowedTools`, `model`, `maxTurns`, `createSdkMcpServer` | agents, tools, hooks, harness |
| Anthropic API loops | `messages.create`, `tool_use` handling, `while`/`for` loops around calls | agent + loop decision + tools |
| OpenAI Agents SDK | `Agent(name=, instructions=, tools=, handoffs=)`, `Runner.run` | agents, `[handoff]` edges |
| LangGraph | `StateGraph`, `add_node`, `add_edge`, `add_conditional_edges`, `interrupt` | nodes/edges directly; conditionals → decision; interrupt → human |
| CrewAI | `Agent(role=, goal=)`, `Task(`, `Crew(process=Process.sequential|hierarchical)` | agents, task flow, manager agent |
| AutoGen / AG2 | `AssistantAgent`, `UserProxyAgent`, `GroupChat`, `GroupChatManager` | agents, human, orchestrator |
| Pi | `~/.pi/agent/extensions/`, `pi.on(`, session JSONL | agent + extensions as hooks |
| Hermes Agent | `~/.hermes/config.yaml` (`hooks`, `skills`, `tools`), `HOOK.yaml` | agent, hooks, tools |
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
