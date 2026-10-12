---
name: flow-tower-optimize
description: Optimize an agentic system mapped in a Flow Tower (`*.tower.yaml`) in six fixed phases - intake, a scripted inventory, a structure audit against best practices, model fit per role, proposals the user approves one by one, and a scripted before/after check. Use when the user asks to improve, review, harden or audit their tower or agent system, asks how to build a good tower or flow, which practices apply, or which model fits each role; also to adapt a gallery example to their own project.
---

# Flow Tower: optimize a tower

Six phases, always in this order; what changes per tower is which rules fire, which roles it has, and which cases
the benchmark uses. CLI: `{{FLOW_TOWER_CLI}}` (setup in the [flow-tower skill](../flow-tower/SKILL.md)). The method is
drawn as the [tower-optimizer example](../../examples/tower-optimizer/README.md); the practices and their sources are
in [docs/best-practices.md](../../docs/best-practices.md). Scripts: `examples/tower-optimizer/scripts/` (Node 22, no
dependencies).

Facts come from code. A model (you) only reviews patterns and drafts changes, and every finding names a node.

## 1 · Intake

Ask, before running anything:
- which tower (path), and its repo if the tower describes code;
- what matters most: cost, latency, quality or risk;
- which files you may read for phases 3-5. Phases 2 and 6 are local scripts.

Starting from a gallery example for their own project? Copy it first
([flow-tower-use-example](../flow-tower-use-example/SKILL.md)), then optimize the copy.

## 2 · Inventory (scripted)

```bash
{{FLOW_TOWER_CLI}} validate <tower>                                  # fix errors first
node examples/tower-optimizer/scripts/snapshot.mjs <tower> reports/<name>.before.json
```

Read the inventory (counts, models, which nodes have budget, limits, approval, evals, sandbox) back to the user in a
few lines. If the tower is wired to live events, add measured cost and latency per node from the history; without
them, say every effect below is estimated.

## 3 · Structure audit

1. **Rules**: `{{FLOW_TOWER_CLI}} audit <tower>` lists findings AUD01-AUD11 with node and level. Each rule is a
   section of best-practices.md: link it when you explain one.
2. **Pattern review**: answer the seven lines of [rubric.md](../../examples/tower-optimizer/rubric.md). Every finding
   names a node, quotes its YAML exactly, cites a source (S1-S12) or says "engineering judgement". Before showing a
   finding, check the quote is really at that node; drop it otherwise. No finding beats an invented one.

## 4 · Model fit per role

`audit` prints the role of each node that runs a model, what the role needs and the OpenRouter categories to look in
([categories.md](../../examples/tower-optimizer/categories.md)). For a role worth changing:
`node skills/flow-tower-costs/models.mjs` for today's prices, a shortlist of 3-5 with the same capabilities and data
policy, then the [flow-tower-costs](../flow-tower-costs/SKILL.md) benchmark on the project's own cases. Ask the pace
(now, relaxed, overnight) before a long run. Never propose a model on price alone.

## 5 · Proposals

Write them as in [proposals.md](../../examples/tower-optimizer/proposals.md): one change each, ranked (warnings first,
then effect over effort, pattern changes last), each a tower diff that passes `{{FLOW_TOWER_CLI}} validate` on a
copy. Show them one at a time; apply only what the user accepts. Code changes in the repo go on a branch and a PR.

## 6 · Verify (scripted)

```bash
node examples/tower-optimizer/scripts/snapshot.mjs <tower> reports/<name>.after.json
node examples/tower-optimizer/scripts/compare.mjs reports/<name>.before.json reports/<name>.after.json --md reports/<name>.compare.md
```

`compare.mjs` exits 1 on a new warning: that is a regression, go back to phase 5. Report fixed, new and open
findings, the inventory deltas and model changes; re-run evals and the benchmark when a model changed. Optionally
export a PDF of the improved tower.

## Never

- Send files to a model the user did not agree to.
- Report a finding without a node and the YAML it quotes.
- Apply a change the user has not approved, or one that does not validate.
- Invent numbers: unmeasured is "estimated", and say so.
