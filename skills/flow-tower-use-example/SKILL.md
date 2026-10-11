---
name: flow-tower-use-example
description: Start a Flow Tower (`*.tower.yaml`) from one of the library's example towers, copied with its folder into the user's project and adapted to their system. Use when the user wants a tower like an existing example or preset (dev squad, RAG bot, PR reviewer, command center…), asks how to start from an example, or wants a ready tower to edit rather than one generated from scratch.
---

# Flow Tower: start from an example

CLI: `{{FLOW_TOWER_CLI}}`. If this still shows a placeholder: `flow-tower` once `npm link` ran inside the clone, otherwise `node <clone>/bin/flow-tower.js` ([getting started](../../docs/getting-started.md)).

**Never copy a dogfood tower to adapt it** (the "Flow Tower's own towers" section): they point at the flow-tower repo with `root: ../..` and break once copied.

## Steps

1. **Find the closest example**: `flow-tower copy --list`, then the sections of the clone's `examples/README.md` (Starters, Agent systems, Operations and team hub, Beyond agents). Pick by pattern, not by domain; a starter if unsure.
2. **Copy it with its folder**: `flow-tower copy <example> [dest]` (default: `./<name>`). It refuses to overwrite, validates the copy and prints next steps.
3. **Adapt it** to the user's system: `root:`, every `files:` / `from:` path, names, models, runtimes. Remove what the system does not have; be true to its code. Schema: [flow-tower reference](../flow-tower/reference.md); what goes where: [docs/what-goes-where.md](../../docs/what-goes-where.md).
4. **Validate to 0/0**: `flow-tower validate <dest>`; fix every error and warning.
5. **See it live**: run the `simulate` command `copy` printed, then connect the agent's hooks ([docs/realtime.md](../../docs/realtime.md)).
6. Optionally **connect to a command center** ([docs/command-center.md](../../docs/command-center.md)).

Report: which example, where it was copied, what was adapted, validation counts.
