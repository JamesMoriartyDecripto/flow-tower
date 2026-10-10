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

Collect facts before modelling. [reference.md](../skills/flow-tower/reference.md) § Signals lists what to search per framework. Note, for each item, the file **and line** that proves it.

**Read in full what decides the flow:** rule and protocol docs, the bodies of agent and command files, hook **code**, route and middleware registration, the loop that calls the model. Headers, frontmatter, comments and file names are not enough: they are where the first draft goes wrong, and frontmatter can even contradict the body.

Capture:

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

Not an agent system? An HTTP API, a middleware chain or a set of workers maps just as well: see [what goes where § Services without agents](what-goes-where.md#services-without-agents).

### 3. Model the layers

Read [what goes where](what-goes-where.md) first: what belongs in a layer, a node, an edge and a nested tower. Pick layers top to bottom from [reference.md](../skills/flow-tower/reference.md) § Layer playbook, keeping only layers that have real content (3–10 nodes per layer is the sweet spot). In each layer, order nodes left to right as the flow actually runs.

- Agents go in the `agents:` registry. Use `from: .claude/agents/x.md` for Claude Code subagents instead of copying them.
- Prompts that live in files go in `prompts:` with `file:`. Never paste long prompts inline.
- Cross-layer relations go in `links` (`layer.node`): agent→tool `[call]`, orchestrator→subagent `[spawn]`, reads/writes `[data]`.
- Loops are explicit: a decision node plus a `[return]` edge labelled with the cap, e.g. `"max 3"`.
- A component with its own multi-step internals (more than ~5 steps) gets a **nested tower** via `tower:`.
- `runtimes:` come from deploy config (Dockerfile, compose, k8s, CI workflows, serverless config, README). Reference them with `runtime:` on agents and nodes.
- `resources:` point to real log files, scripts and dashboard URLs found in the repo. Never invent URLs.
- `status: planned | experimental | deprecated` only when the code or docs say so (TODOs, feature flags, deprecation notes).
- Operational fields ([schema § Operations](schema.md#operations)) only when the code or config shows them: `trigger` (cron schedules, webhooks, queues), `approval` (human gates, their timeouts), `budget` / `limits` (max_turns, budget_usd, timeouts, retries, loop caps; `retries` counts retries, so `stop_after_attempt=3` is `retries: 2`), `fanout` (parallel subagents; `max` is the cap in the code, and without one leave `fanout` out and say so in the description), `data` (PII, region, retention), `sandbox`, `credentials`, `evals` (only real measured values, or targets the repo states). Wire protocols on edges (`protocol: mcp | a2a | http | webhook | queue`) when the transport is explicit.
- **Every exit, not only the happy path.** Errors, rejections, early returns and timeouts are edges too. When many checks can reject, draw one `output` node for the rejection with labelled edges (`401`, `429`) rather than an edge from every check to the main reply.
- **Who invokes whom.** For every agent → skill / tool / subagent edge, find the file that names the owner and check the direction: a skill can invoke an agent, not the other way round.
- **Hooks: classify them from their code, not their name.** Say in the description whether the hook blocks (exit 2, `deny`), asks (`ask`), only adds a reminder (`additionalContext`), or prints something nobody sees (stderr with exit 0). Hooks under different matchers are independent and fire side by side: do not chain them.
- **When the sources disagree, write it down** instead of picking a side silently: `CLAUDE.md says X; agents/foo.md says Y; this tower follows Y (the code)`.
- Labels have at most 18 characters (13 on a node that opens a nested tower): `validate` warns above that. Details go in `description`. If something is inferred rather than explicit, say so: `(inferred from …)`.
- Write labels and descriptions in the **language of the system you map** (its README, comments and UI), not necessarily English. Ask if it is unclear.

### 4. Write the YAML

First line: `# yaml-language-server: $schema=<relative path or URL to flow-tower.schema.json>` when the schema is reachable (the public URL is `https://raw.githubusercontent.com/JamesMoriartyDecripto/flow-tower/main/schema/flow-tower.schema.json`).

Quote values that YAML would read differently:

- any value containing `: ` or ` #`, anywhere (block or one-line map): `description: "Gate: blocks the PR"`. Unquoted, the first is a parse error and the second silently cuts the text at `#`;
- in one-line maps, also any value containing `,` `{` `}` `[` `]`: `{ id: a, description: "Search, then read" }`.

### 5. Validate and fix until clean

```bash
node <flow-tower>/bin/flow-tower.js validate <tower-file> --json
```

- Fix every `error`: unknown keys, bad references, missing endpoints.
- Fix every `warning`: missing files and resources. Correct the path, or drop the reference if the file really does not exist.
- Fix `info: node has no connections` by connecting the node, or remove it if it is not part of the flow.
- Re-run until it reports no errors and no warnings. The exit code is 1 only on errors, so read the report: warnings still exit 0.

### 6. Verify against the code

`validate` proves the YAML is consistent, not that it is **true**. A tower modelled from comments and file names validates clean and is still wrong: gates drawn in sequence that run in parallel, a hook drawn as blocking that only reminds, a logger drawn writing to the wrong store, missing error exits. Before reporting, check the tower against the sources:

- **Edges:** for each edge, find the line that proves the order or the direction (call order, middleware mount order, `add_edge`, who spawns whom). Fix or drop edges with no proof.
- **Exits:** for each node, list every way out in the code (errors, rejections, early returns, retries) and check each one is drawn or deliberately left out.
- **Traces:** follow at least one full run per entry point through the code, start to end, and compare it with the path in the tower. Watch for code that runs somewhere other than where it is registered, such as a wrapper around the response that runs last although it is mounted first.
- **Gates and loops:** sequence or parallel, mandatory or conditional, where a failure goes, what caps the loop.
- **Fresh eyes for big systems.** Above ~40 nodes or with several nested towers, split the check: reviewers with a fresh context (subagents, if your harness has them), read-only, one per layer group or nested tower, each comparing its part line by line with the sources and returning the discrepancies.

Fix what the check finds, validate again, and keep two lists for the report: what you **traced** in the code and what you only **inferred**.

### 7. Live wiring (offer, don't force)

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

### 8. Report

Tell the user, briefly:

- files written;
- layers, nodes and nested towers;
- what was traced in the code, what was only inferred, and where the sources disagree;
- how to open it: `node <flow-tower>/bin/flow-tower.js <tower-file>` (or a folder, for the library view). It serves on `http://127.0.0.1:5317` and opens a browser; add `--no-open` in headless environments, and `--port 5318` if another tower is already open (live events go to the port the hooks point at).

## Updating an existing tower

- Read the current tower first and preserve the user's manual choices: layer order, labels, descriptions, `meta`.
- Add new components, update changed ones, and remove nodes whose code is gone. If the user tracks evolution, mark them `status: deprecated` instead of deleting them.
- Summarize the structural diff in the report: added, removed and changed agents, tools and edges.

## Never

- Invent agents, files, prompts, URLs or metrics that the code does not show.
- Put secrets, tokens or `.env` values in the tower. Reference secret **names** in `meta` if useful.
- Edit the system's code. This procedure only reads code and writes tower files.
