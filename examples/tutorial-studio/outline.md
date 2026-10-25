# Outline: Flow Tower, what towers are and when to use one

The outline the maintainer approves before the script is written. One row per scene: what is on screen, what the
narration says, and the source it comes from. Times are budgets at about 150 words a minute; the real length comes
from the voice clips.

## 1. Why (about 1 min)

| Scene | On screen | Narration (gist) | Source |
|---|---|---|---|
| `why-problem` | The library, slowly scrolling | An agent system lives in prompts, tools, subagents, hooks and config spread over many files; nobody sees all of it at once | `README.md` intro |
| `why-tower` | Open `dev-squad`: the tower appears | A tower shows the whole system in one picture, and every piece opens the file behind it | `README.md`, `docs/what-goes-where.md` |

## 2. How a tower works (about 2 min)

| Scene | On screen | Narration (gist) | Source |
|---|---|---|---|
| `how-layers` | PageDown through the layers | Layers are stages of a run, top to bottom; inside a layer the flow reads left to right | `docs/what-goes-where.md` § Layers |
| `how-nodes` | Arrow keys across one layer; types visible | A node is one thing that does one step: agent, tool, model, decision, human, guard, hook, memory | § Nodes |
| `how-edges` | Select a node: its paths light up | Edges say what passes between steps and how: flow, call, spawn, handoff, return, data. Links cross layers | § Edges and links |
| `how-files` | Open the node's file in the viewer | Every node points at real files: the prompt, the script, the config | § Nodes (`files`) |
| `how-subtower` | Enter a sub-tower, then Esc | A node with its own multi-step flow opens a nested tower | § Nested towers |
| `how-yaml` | The tower's YAML in the viewer | All of this is one YAML file you can read, diff and review | `docs/getting-started.md` § 2 |

## 3. When to use one (about 1.5 min)

| Scene | On screen | Narration (gist) | Source |
|---|---|---|---|
| `when-design` | Map view (M) of a larger example | Design a system before you build it, and show it to the people who will review it | `examples/README.md` |
| `when-review` | `audit` findings shown as an overlay | Review it against best practices: loops without a cap, irreversible actions without a gate | `docs/best-practices.md` |
| `when-live` | Simulated events light the nodes | Watch it run: hooks send events and the nodes light up | `docs/getting-started.md` § 4 |
| `when-not` | Back to the single-agent starter | When not: a single prompt or a one-call script does not need a tower | `docs/what-goes-where.md` (keep only real content) |

## 4. How to start yours (about 2.5 min)

| Scene | On screen | Narration (gist) | Source |
|---|---|---|---|
| `start-gallery` | The library, filtered | Start from the example closest to your pattern: starters, agent systems, operations | `examples/README.md` |
| `start-copy` | `flow-tower copy` as an overlay, then the copy open | Copy it with its folder, then rename layers and nodes and point files at your own | `docs/getting-started.md` § 1 |
| `start-agent` | `install-skill` as an overlay | Or let your coding agent read your code and write it | `docs/getting-started.md` § 3 |
| `start-validate` | `validate --json` overlay: 0 errors, 0 warnings | Validate after every edit; the open tower reloads when you save | `docs/getting-started.md` § 2 |

## 5. Close (about 15 s)

| Scene | On screen | Narration (gist) | Source |
|---|---|---|---|
| `close` | The dev-squad tower, auto-orbit (O) | Where to read next: getting started, what goes where, the examples gallery | `docs/getting-started.md` |
