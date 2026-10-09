# Tower file reference

A tower is one YAML file (`*.tower.yaml`). Add the first line below to get autocomplete and validation in VS Code (YAML extension):

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/JamesMoriartyDecripto/flow-tower/main/schema/flow-tower.schema.json
```

Unknown keys are **errors**, so typos never fail silently.

## Top level

| Key | Type | Notes |
|---|---|---|
| `version` | `1` | Optional, defaults to 1. |
| `name` | string | **Required.** Shown in the breadcrumb. |
| `description` | string | |
| `root` | path | Base directory for every relative path. Defaults to the tower file's directory. |
| `prompts` | map id → [Prompt](#prompt) | Reusable system prompts. |
| `agents` | map id → [Agent](#agent) | Reusable agent definitions. |
| `layers` | list of [Layer](#layer) | **Required.** Ordered **top to bottom**. |
| `links` | list of [Edge](#edge) | Cross-layer edges. Endpoints are written `layer.node`. |

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
| `model`, `prompt`, `tools`, `files`, `tower`, `meta` | Override or set directly. |

Every path in `files` opens in the file viewer. Missing files are reported as warnings.

## Edge

Shorthand string or object:

```yaml
edges:
  - triage -> planner
  - triage -> quickfix: trivial
  - lead -> coder [spawn]
  - lead -> coder [spawn]: implement step
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

Any agent or node with `tower:` gets a stacked-plates badge. Double-click it (or press **Enter** while it is selected) to dive in; use the breadcrumb, **Esc** or **Backspace** to go back up. Nested towers are separate files with their own `root`, prompts and agents, and they can nest further.

## Validation

| Level | Examples |
|---|---|
| error | invalid YAML, unknown keys, unknown agent/prompt reference, edge to a missing node, duplicate ids |
| warning | referenced file not found |
| info | node without connections |

Open the panel with the **ERR / WARN** badge in the top bar.
