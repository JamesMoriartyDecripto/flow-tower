# Generate a tower from a codebase

This is the procedure any coding agent follows to turn an agentic codebase into a correct, validated `*.tower.yaml` that opens in Flow Tower. It works the same in Claude Code, OpenAI Codex, Pi, Hermes Agent, Cursor or any other harness that can read files and run shell commands.

The tower is only useful if it is **true to the code**: every node, prompt and file must come from what you actually read. A smaller, accurate tower beats a big, invented one.

## Setup: find the flow-tower CLI

Commands below are written as `node <flow-tower>/bin/flow-tower.js …`, where `<flow-tower>` is the absolute path of a flow-tower checkout. Find it in this order:

1. You are reading this file from an installed skill or from `flow-tower guide`: the paths are already filled in.
2. The current repo is flow-tower itself (it has `bin/flow-tower.js` and `skills/flow-tower/`): use its root.
3. `command -v flow-tower` finds a linked CLI (`npm link`): use `flow-tower …` instead of `node <flow-tower>/bin/flow-tower.js …`.
4. Otherwise ask the user where their checkout is, or set one up once (Node >= 22.12, check with `node --version`):

   ```bash
   git clone https://github.com/JamesMoriartyDecripto/flow-tower.git && cd flow-tower && npm install
   ```

`node <flow-tower>/bin/flow-tower.js guide` prints this procedure. Schema details: [reference.md](../skills/flow-tower/reference.md) (cheat sheet, layer playbook, framework signals) and [schema.md](schema.md) (full reference).

## Procedure

### 1. Scope

Find the system root: the folder that contains the agent code. If several independent systems exist, ask which one, or make one tower per system. Choose the output path, by default `<root>/<system-name>.tower.yaml`, with nested towers in `<root>/towers/`. If a tower already exists, you are **updating** it (see below).

### 2. Inventory (read-only)

Collect facts before modelling. [reference.md](../skills/flow-tower/reference.md) § Signals lists what to search per framework. Note, for each item, the file that proves it. Capture:

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

### 3. Model the layers

Pick layers top to bottom from [reference.md](../skills/flow-tower/reference.md) § Layer playbook, keeping only layers that have real content (3–10 nodes per layer is the sweet spot). In each layer, order nodes left to right as the flow actually runs.

- Agents go in the `agents:` registry. Use `from: .claude/agents/x.md` for Claude Code subagents instead of copying them.
- Prompts that live in files go in `prompts:` with `file:`. Never paste long prompts inline.
- Cross-layer relations go in `links` (`layer.node`): agent→tool `[call]`, orchestrator→subagent `[spawn]`, reads/writes `[data]`.
- Loops are explicit: a decision node plus a `[return]` edge labelled with the cap, e.g. `"max 3"`.
- A component with its own multi-step internals (more than ~5 steps) gets a **nested tower** via `tower:`.
- `runtimes:` come from deploy config (Dockerfile, compose, k8s, CI workflows, serverless config, README). Reference them with `runtime:` on agents and nodes.
- `resources:` point to real log files, scripts and dashboard URLs found in the repo. Never invent URLs.
- `status: planned | experimental | deprecated` only when the code or docs say so (TODOs, feature flags, deprecation notes).
- Operational fields ([schema § Operations](schema.md#operations)) only when the code or config shows them: `trigger` (cron schedules, webhooks, queues), `approval` (human gates, their timeouts), `budget` / `limits` (max_turns, budget_usd, timeouts, retries, loop caps), `fanout` (parallel subagents), `data` (PII, region, retention), `sandbox`, `credentials`, `evals` (only real measured values, or targets the repo states). Wire protocols on edges (`protocol: mcp | a2a | http | webhook | queue`) when the transport is explicit.
- Labels have at most 18 characters. Details go in `description`. If something is inferred rather than explicit, say so: `(inferred from …)`.

### 4. Write the YAML

First line: `# yaml-language-server: $schema=<relative path or URL to flow-tower.schema.json>` when the schema is reachable (the public URL is `https://raw.githubusercontent.com/JamesMoriartyDecripto/flow-tower/main/schema/flow-tower.schema.json`). Quote any value containing `:` `,` `#` `{` `}` `[` `]` in one-line maps.

### 5. Validate and fix until clean

```bash
node <flow-tower>/bin/flow-tower.js validate <tower-file> --json
```

- Fix every `error`: unknown keys, bad references, missing endpoints.
- Fix every `warning`: missing files and resources. Correct the path, or drop the reference if the file really does not exist.
- Fix `info: node has no connections` by connecting the node, or remove it if it is not part of the flow.
- Re-run until it reports no errors and no warnings (exit code 0).

### 6. Live wiring (offer, don't force)

If the system runs on a supported harness, add `match:` rules where node names differ from runtime agent or tool names, and point the user to the ready-made config:

| Harness | Live events |
|---|---|
| Claude Code | [`integrations/claude-code/`](../integrations/claude-code/) |
| Claude Agent SDK | [`integrations/agent-sdk/`](../integrations/agent-sdk/) |
| Pi | [`integrations/pi/`](../integrations/pi/) |
| Hermes Agent | [`integrations/hermes/`](../integrations/hermes/) |
| OpenAI Codex | [`integrations/codex/`](../integrations/codex/): hooks.json, `notify`, or `codex exec --json \| flow-tower emit --source codex` |
| Anything else (cron, CI, your own loop) | `flow-tower emit` or a plain `POST /api/events` |

Event format and matching rules: [realtime.md](realtime.md).

### 7. Report

Tell the user, briefly:

- files written;
- layers, nodes and nested towers;
- what was inferred and what is uncertain;
- how to open it: `node <flow-tower>/bin/flow-tower.js <tower-file>` (or a folder, for the library view). It serves on `http://127.0.0.1:5317` and opens a browser; add `--no-open` in headless environments.

## Updating an existing tower

- Read the current tower first and preserve the user's manual choices: layer order, labels, descriptions, `meta`.
- Add new components, update changed ones, and remove nodes whose code is gone. If the user tracks evolution, mark them `status: deprecated` instead of deleting them.
- Summarize the structural diff in the report: added, removed and changed agents, tools and edges.

## Never

- Invent agents, files, prompts, URLs or metrics that the code does not show.
- Put secrets, tokens or `.env` values in the tower. Reference secret **names** in `meta` if useful.
- Edit the system's code. This procedure only reads code and writes tower files.
