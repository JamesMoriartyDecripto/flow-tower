# Tower file reference

A tower is one YAML file (`*.tower.yaml`). Add the first line below to get autocomplete and validation in VS Code (YAML extension):

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/JamesMoriartyDecripto/flow-tower/main/schema/flow-tower.schema.json
```

Unknown keys are **errors**, so typos never fail silently.

> **YAML gotcha:** inside one-line maps (`{ ... }`) a comma ends the value. Quote any text that contains commas: `{ id: a, description: "plans, routes and reviews" }`. Otherwise the rest becomes a bogus key and validation reports it.

## Top level

| Key | Type | Notes |
|---|---|---|
| `version` | `1` | Optional, defaults to 1. |
| `name` | string | **Required.** Shown in the breadcrumb. |
| `description` | string | |
| `tags` | list of strings | Filter chips in the library view. |
| `root` | path | Base directory for every relative path. Defaults to the tower file's directory. Every referenced file (and `root` itself) must stay inside the project: the git repository that contains the tower, or the folder you opened. Paths outside are refused with an error, so a tower from a cloned repository cannot read your other files. |
| `runtimes` | map id → [Runtime](#runtime) | Where things execute: laptop, servers, SaaS, CI... |
| `prompts` | map id → [Prompt](#prompt) | Reusable system prompts. |
| `agents` | map id → [Agent](#agent) | Reusable agent definitions. |
| `layers` | list of [Layer](#layer) | **Required.** Ordered **top to bottom**. |
| `links` | list of [Edge](#edge) | Cross-layer edges. Endpoints are written `layer.node`. |

## Runtime

Real systems are hybrid: some agents run on a laptop, others in containers on a server, some steps are third-party services, CI jobs or serverless functions. Declare each place once and reference it from agents and nodes.

```yaml
runtimes:
  laptop:  { kind: local, label: Dev laptop }
  vps:     { kind: server, host: vps-01, provider: hetzner, region: fsn1 }
  gha:     { kind: ci, provider: github-actions }
  context7: { kind: saas, url: https://context7.com }
```

`kind`: `local` `server` `cloud` `container` `serverless` `saas` `edge` `ci` `browser` `device`. Optional: `label`, `description`, `host`, `provider`, `region`, `url` (http/https), `meta`.

Nodes inherit the runtime of their agent. In the app, the **Runtimes** tab of the legend spotlights every node running in one place, and the node tag shows `@runtime`.

## Resources

Logs, scripts, dashboards, endpoints, queues, databases attached to a node or agent:

```yaml
resources:
  - { kind: log, label: Worker log, path: logs/worker.log }          # opens in the viewer (large logs show their tail)
  - { kind: dashboard, label: Grafana, url: https://grafana.example.com/d/abc }   # opens in a new tab
```

`kind`: `log` `script` `dashboard` `endpoint` `config` `doc` `queue` `database` `repo` `recording` `other`. Exactly one of `path` or `url`. **Never put secrets here**: reference them by name in `meta` if needed.

## Prompt

Exactly one of `file` or `text`.

```yaml
prompts:
  orchestrator: { file: prompts/orchestrator.md, description: Lead planner }
  critic:
    text: |
      Score {{draft}} from 1 to 10 against {{rubric}}.
```

`vars` is auto-detected from `{{var}}` placeholders; set it explicitly to override. The inspector shows an approximate token count.

A node or agent can reference a prompt by id (`prompt: critic`) or define one inline (`prompt: { text: ... }`).

## Agent

```yaml
agents:
  lead:
    name: Lead Orchestrator
    model: claude-opus-5-5
    prompt: orchestrator
    tools: [Task, Read, github]
    harness: { max_turns: 40, permission_mode: default, budget_usd: 5 }   # free-form
    files: [src/orchestrator.ts]
    tower: towers/lead.tower.yaml     # optional nested tower
    meta: { owner: platform-team }    # free-form

  reviewer:
    from: .claude/agents/reviewer.md  # Claude Code agent file
    tower: towers/reviewer.tower.yaml
```

`from:` reads the YAML frontmatter (`name`, `description`, `model`, `tools`, anything else goes to `meta`) and uses the Markdown body as the system prompt. Explicit keys override imported ones.

## Operations

Optional fields on agents and nodes that describe **how a step runs in production**. Nodes inherit them from their agent; a field set on the node replaces the agent's. The node subtitle shows short markers (`×3–5`, `PII`, `WEBHOOK`, `≤15m`, `$2`), fan-out nodes get stacked ghost outlines, and the inspector lists everything under **Operations**, **Data** and **Evals**.

```yaml
- id: alert
  type: entry
  trigger: { kind: webhook, source: PagerDuty }
- id: searcher
  agent: searcher
  fanout: { min: 3, max: 5, by: query complexity }
  budget: { usd: 2, turns: 30, on_exceed: pause }
  limits: { timeout: 10m, retries: 2, backoff: "exponential 2s..60s", max_iterations: 3 }
  data: { sensitivity: pii, region: eu, retention: 30d }
  evals:
    - { name: citation accuracy, value: 0.93, target: 0.9 }
    - { name: p95 latency (s), value: 41, target: 60, higher_is_better: false }
  version: v4
  rollout: { strategy: canary, percent: 10, previous: v3 }
  credentials: service
  sandbox: { network: allowlist, allow: [api.github.com], filesystem: workspace }
- id: oncall
  type: human
  approval: { by: on-call SRE, via: Slack, actions: [approve, reject], timeout: 15m, on_timeout: escalate }
  sla: 72h
```

| Key | Values |
|---|---|
| `trigger` | `kind`: `manual` `cron` `webhook` `event` `queue` `chat` `email` `file`; `schedule` (cron expression), `source`, `description` |
| `approval` | `by`, `via`, `actions` (`approve` `edit` `reject` `respond` `snooze`), `timeout`, `on_timeout` (`approve` `reject` `escalate` `wait`) |
| `budget` | `usd`, `tokens`, `turns`, `on_exceed` (`pause` `stop` `escalate` `downgrade`) |
| `limits` | `timeout`, `ttl` (session / sandbox lifetime), `retries`, `backoff`, `max_iterations` (loop bound), `concurrency` |
| `fanout` | a number ≥ 2, or `{ min, max, by }`: parallel copies of the node |
| `data` | `sensitivity` (`public` `internal` `confidential` `pii` `phi` `pci` `secret`), `region`, `retention`, `description` |
| `evals` | list of `{ name, value, target, higher_is_better, description, url }`; value vs target is colored |
| `version`, `rollout` | `rollout.strategy`: `all` `canary` `ab` `shadow` `blue-green` `rainbow`; `percent`, `previous` |
| `sla` | deadline to complete, e.g. `72h` |
| `credentials` | whose credentials tools use: `service`, `author` or `user` |
| `sandbox` | `network` (`none` `allowlist` `open`), `allow` (hosts), `filesystem` (`none` `read-only` `workspace` `full`) |

Durations are a number plus `ms` `s` `m` `h` `d` `w` (`90s`, `15m`, `72h`). Edges can also carry a wire **`protocol`**: `mcp` `a2a` `http` `grpc` `webhook` `queue` `event` `stdio` (object form only), shown next to the edge label. Resources gain the `recording` kind (session recordings, browser replays).

## Layer

```yaml
layers:
  - id: orchestration          # letters, digits, _ and -
    title: Orchestration
    description: Plans the work and dispatches specialists
    nodes: [...]
    edges: [...]
```

## Node

| Key | Notes |
|---|---|
| `id` | Unique within the layer. Globally addressed as `layer.node`. |
| `type` | `entry` `output` `agent` `process` `decision` `tool` `model` `memory` `human` `guard` `hook`. Defaults to `agent` when `agent` is set, else `process`. |
| `label` | Short display name (≈18 chars). Defaults to the agent name or the id. |
| `description` | Long text, shown in the inspector. |
| `agent` | Reference to the `agents` registry. The node inherits model, prompt, tools, files and tower. |
| `runtime` | Reference to `runtimes`. Inherited from the agent. |
| `status` | `active` (default) · `planned` · `experimental` · `deprecated`. Non-active nodes get a dashed outline: use it to show structural changes in progress. |
| `resources` | See [Resources](#resources). |
| `match` | Live event rules (`"agent:coder"`, `"source:ci&tool:deploy*"`). Inherited from the agent. See [realtime](realtime.md). |
| `model`, `prompt`, `tools`, `files`, `tower`, `meta` | Override or set directly. |
| `trigger`, `approval`, `budget`, `limits`, `fanout`, `data`, `evals`, `version`, `rollout`, `sla`, `credentials`, `sandbox` | See [Operations](#operations). Inherited from the agent. |

Every path in `files` opens in the file viewer. Missing files are reported as warnings.

## Edge

Shorthand string or object:

```yaml
edges:
  - triage -> planner
  - "triage -> quickfix: trivial"            # quote it: with ": label" YAML would read a map
  - lead -> coder [spawn]
  - "lead -> coder [spawn]: implement step"
  - { from: review, to: coder, kind: return, label: changes requested, condition: "score < 8" }
```

| Kind | Meaning | Style |
|---|---|---|
| `flow` | Sequential control flow (default) | orange solid |
| `call` | Synchronous call (tool, function) | white solid |
| `spawn` | Starts a sub-agent | amber dashed |
| `handoff` | Transfers control to another agent | orange thick |
| `return` | Result going back | white dashed |
| `data` | Reads / writes data (memory, files) | white thin dashed |

## Nested towers

Any agent or node with `tower:` is marked as a sub-tower: a stacked-plates badge on the node, `⇣ SUB` in its subtitle, a **SUB-TOWER** chip in the inspector, and an entry in the **Sub-towers** list at the bottom of the Layers panel (click to select, ⇣ to enter). Double-click it (or press **Enter** while it is selected) to dive in; use the breadcrumb, **Esc** or **Backspace** to go back up. Nested towers are separate files with their own `root`, prompts and agents, and they can nest further.

## Library

`flow-tower <dir>` scans recursively for `*.tower.yaml` (skipping `node_modules` and dot-folders). Towers referenced by another tower are nested; the others become **projects** in the library (press **L**). Pass several files or directories to combine projects from different repos.

## Validation

| Level | Examples |
|---|---|
| error | invalid YAML, unknown keys, unknown agent/prompt/runtime reference, edge to a missing node, duplicate ids |
| warning | referenced file or resource not found |
| info | node without connections |

Open the panel with the **ERR / WARN** badge in the top bar.
