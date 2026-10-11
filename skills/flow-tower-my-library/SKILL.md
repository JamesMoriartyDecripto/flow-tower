---
name: flow-tower-my-library
description: Keep, list, open and organise the user's own towers (`*.tower.yaml`) across their projects through the flow-tower library. Use when the user asks where their towers should live, or wants their towers kept out of the flow-tower repo and its examples.
---

# Flow Tower: your own library

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)).

**Rules** — the library is only a list of paths in the user folder's `config.json`:

- towers stay in the user's own projects, never in the flow-tower checkout or under `examples/`;
- examples are copied out with the [use-example skill](../flow-tower-use-example/SKILL.md), and only the [contribute skill](../flow-tower-contribute/SKILL.md) proposes a tower back into `examples/`.

## Steps

1. **See what is there**: `flow-tower library list`.
2. **Add a tower**: `flow-tower library add <path>` (a `.tower.yaml` or a folder), reading the refusal reasons.
3. **Validate to 0/0**: `flow-tower validate <path>`.
4. **Open it**: `flow-tower library` (`--with-examples` shows both, with MINE / EXAMPLE badges).
5. **Remove one**: `flow-tower library remove <path>`.
6. **On a hub**: the hub lights only towers in its own library, so put the same tower on the hub's machine too ([docs/command-center.md](../../docs/command-center.md)).

**Ask before** moving or deleting the user's files.

Report: what was added or refused and why, and the list.
