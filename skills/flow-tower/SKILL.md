---
name: flow-tower
description: Map an AI agent or multi-agent system into a Flow Tower (`*.tower.yaml`), an interactive 3D tower of flowchart layers showing agents, subagents, prompts, tools/MCP, hooks, memory, models, runtimes and logs. Use when the user asks to visualize, map, diagram, document or audit the structure of an agent, agentic loop, Claude Code / Codex / Pi / Hermes setup, Agent SDK app, LangGraph/CrewAI/OpenAI Agents/AutoGen project, or asks to create or update a tower / flow-tower file, even when they don't say "tower".
---

# Flow Tower: generate a tower from a codebase

Turn an agentic codebase into a correct, validated `*.tower.yaml`. Be **true to the code**: a smaller, accurate tower beats a big, invented one.

CLI: `{{FLOW_TOWER_CLI}}`. If this still shows a placeholder, use `flow-tower` if it is on PATH, otherwise ask the user for their flow-tower checkout and run `node <path>/bin/flow-tower.js` (setup: `git clone https://github.com/JamesMoriartyDecripto/flow-tower.git && cd flow-tower && npm install`, Node >= 22.12).

**Read and follow [the full procedure](../../docs/generate-a-tower.md)** before starting. Load the rest only when needed: [reference.md](reference.md) for the schema cheat sheet, layer playbook and per-framework signals; the flow-tower repo's `examples/README.md` to copy the closest example; `docs/schema.md` for every field.

## Checklist

1. **Scope:** system root, one tower per system, output `<root>/<system>.tower.yaml` (nested towers in `<root>/towers/`). Existing tower → update it, preserving manual choices.
2. **Inventory, read-only:** entry points, orchestrator, agents (model, prompt, tools, limits), tools/MCP, hooks, memory, human checkpoints, loops and caps, runtimes, logs/scripts/dashboards. Note the file and line that proves each one. Read in full what decides the flow (rule docs, agent and command bodies, hook code, middleware registration), not only headers, frontmatter, comments or file names. Plain services (HTTP APIs, workers) work too: [reference.md](reference.md) § Services.
3. **Model layers** (what goes in layers, nodes, edges and nested towers: [reference.md](reference.md) § What goes where) top to bottom, nodes left to right in run order; `agents:` and `prompts:` registries; cross-layer `links`; loops as decision + `[return]` with cap; every exit drawn (errors, rejections, early returns); nested `tower:` for big components; labels ≤ 18 chars (13 with a nested tower), in the mapped system's language. Classify hooks from their code (block / ask / remind). Where sources disagree, say so in the description. Add operational fields (`trigger`, `approval`, `budget`, `limits`, `fanout`, `data`, `evals`, `sla`, `sandbox`…) only when config or code shows them.
4. **Write** the YAML with the `# yaml-language-server: $schema=…` header. Quote values containing `: ` or ` #`, and in one-line maps also `,` `{` `}` `[` `]`.
5. **Validate** until no errors and no warnings: `{{FLOW_TOWER_CLI}} validate <tower-file> --json`.
6. **Verify against the code:** `validate` proves the file is consistent, not true. Prove each edge's order and direction with a line of code, check every node's exits, trace one full run per entry point; on big systems use fresh-context read-only reviewers per area. Fix, validate again.
7. **Offer live wiring** (`match:` rules, `docs/realtime.md`, `integrations/` in the flow-tower repo).
8. **Report:** files, layers/nodes/nested towers, what was traced vs only inferred, source conflicts, how to open: `{{FLOW_TOWER_CLI}} <tower-file>`.

## Never

- Invent agents, files, prompts, URLs or metrics that the code does not show.
- Put secrets, tokens or `.env` values in the tower.
- Edit the system's code: only read code and write tower files.
