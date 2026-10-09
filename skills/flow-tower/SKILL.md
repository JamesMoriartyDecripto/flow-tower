---
name: flow-tower
description: Map an AI agent or multi-agent system into a Flow Tower (`*.tower.yaml`), an interactive 3D tower of flowchart layers showing agents, subagents, prompts, tools/MCP, hooks, memory, models, runtimes and logs. Use when the user asks to visualize, map, diagram, document or audit the structure of an agent, agentic loop, Claude Code setup, Agent SDK app, LangGraph/CrewAI/OpenAI Agents/AutoGen project, Pi or Hermes setup, or asks to create or update a tower / flow-tower file, even when they don't say "tower".
---

# Flow Tower: generate a tower from a codebase

You turn an agentic codebase into a correct, validated `*.tower.yaml` that opens in Flow Tower. The tower is only useful if it is **true to the code**: every node, prompt and file must come from what you actually read. A smaller, accurate tower beats a big, invented one.

CLI: `{{FLOW_TOWER_CLI}}`. If this still shows a placeholder, use `flow-tower` if it is on PATH, otherwise ask the user for the path to their flow-tower checkout and run `node <path>/bin/flow-tower.js`.

## Workflow

1. **Scope.** Find the system root: the folder that contains the agent code. If several independent systems exist, ask which one, or make one tower per system. Choose the output path, by default `<root>/<system-name>.tower.yaml`, with nested towers in `<root>/towers/`. If a tower already exists, you are **updating** it (see below).

2. **Inventory, read-only.** Collect facts before modelling. Use [reference.md](reference.md) § Signals for what to search per framework. Note for each item the file that proves it. Capture:
   - entry points: CLI, webhook, cron, chat UI;
   - orchestrator and routing logic;
   - every agent and subagent with its model, prompt source, tools and limits (max turns, budget, permission mode);
   - tools and MCP servers;
   - hooks and guardrails;
   - memory and state (files, DBs, vector stores);
   - human checkpoints;
   - loops and their caps;
   - where each part runs (laptop, container, server, CI, SaaS);
   - logs, scripts and dashboards.

3. **Model the layers.** Pick layers top to bottom from [reference.md](reference.md) § Layer playbook, keeping only layers that have real content (3–10 nodes per layer is the sweet spot). In each layer, order nodes left to right as the flow actually runs. Rules:
   - Agents go in the `agents:` registry. Use `from: .claude/agents/x.md` for Claude Code subagents instead of copying them.
   - Prompts that live in files go in `prompts:` with `file:`. Never paste long prompts inline.
   - Cross-layer relations go in `links` (`layer.node`): agent→tool `[call]`, orchestrator→subagent `[spawn]`, reads/writes `[data]`.
   - Loops are explicit: a decision node plus a `[return]` edge labelled with the cap, e.g. `"max 3"`.
   - A component with its own multi-step internals (more than ~5 steps) gets a **nested tower** via `tower:`.
   - `runtimes:` come from deploy config (Dockerfile, compose, k8s, CI workflows, serverless config, README). Reference them with `runtime:` on agents and nodes.
   - `resources:` point to real log files, scripts and dashboard URLs found in the repo. Never invent URLs.
   - `status: planned | experimental | deprecated` only when the code or docs say so (TODOs, feature flags, deprecation notes).
   - Labels have at most 18 characters. Details go in `description`. If something is inferred rather than explicit, say so in the description: `(inferred from …)`.

4. **Write** the YAML. First line: `# yaml-language-server: $schema=<relative path or URL to flow-tower.schema.json>` when the schema is reachable. Quote any value containing `:` `,` `#` `{` `}` `[` `]` in one-line maps.

5. **Validate and fix** until clean:
   ```bash
   {{FLOW_TOWER_CLI}} validate <tower-file> --json
   ```
   - Fix every `error`: unknown keys, bad references, missing endpoints.
   - Fix every `warning`: missing files and resources. Correct the path, or drop the reference if the file really does not exist.
   - Fix `info: node has no connections` by connecting the node or removing it if it isn't part of the flow.
   - Re-run validation until it reports no errors and no warnings.

6. **Live wiring (offer, don't force).** If the system runs on Claude Code, the Agent SDK, Pi or Hermes, add `match:` rules where node names differ from runtime agent/tool names. Point the user to `docs/realtime.md` and `integrations/` in the flow-tower repo.

7. **Report** briefly:
   - files written;
   - layers, nodes and nested towers;
   - what was inferred and what is uncertain;
   - how to open it: `{{FLOW_TOWER_CLI}} <tower-file>`, or a folder for the library view.

## Updating an existing tower

- Read the current tower first and preserve the user's manual choices: layer order, labels, descriptions, `meta`.
- Add new components, update changed ones, and remove nodes whose code is gone. If the user tracks evolution, mark them `status: deprecated` instead of deleting them.
- Summarize the structural diff in the report: added, removed and changed agents, tools and edges.

## Never

- Invent agents, files, prompts, URLs or metrics that the code does not show.
- Put secrets, tokens or `.env` values in the tower. Reference secret **names** in `meta` if useful.
- Edit the system's code. This skill only reads code and writes tower files.
