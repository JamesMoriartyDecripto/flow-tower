# Tower Optimizer

How to make any tower better, as a tower: six fixed phases whose content adapts to what the tower contains. It answers
the questions of [issue #173](https://github.com/JamesMoriartyDecripto/flow-tower/issues/173): how a good tower and good
flows are built, which practices of complex agentic systems apply, how to pick a model per role, and how a user takes a
gallery example and makes it fit their own project.

Facts come from code (`flow-tower audit`, the scripts here). A model only reviews the pattern against a written rubric
and drafts changes, and a person approves each one. The [flow-tower-optimize skill](../../skills/flow-tower-optimize/SKILL.md)
walks an agent through it.

## What it shows

| Layer | What happens there |
|---|---|
| 1 · Intake | Which tower, what matters (cost, latency, quality, risk), which files a model may read |
| 2 · Inventory (scripted) | `validate`, then `audit --json` saved as the "before". [scripts/snapshot.mjs](scripts/snapshot.mjs) |
| 3 · Structure audit | Rules AUD01-AUD11 ([docs/best-practices.md](../../docs/best-practices.md)), then a pattern review against [rubric.md](rubric.md); a guard drops findings whose quote is not at the node ([scripts/check-quotes.mjs](scripts/check-quotes.mjs)) |
| 4 · Model fit per role | Role classes from facts in the tower, OpenRouter categories, shortlist, benchmark. [categories.md](categories.md) |
| 5 · Proposals | One validated diff per change, ranked, approved one by one. [proposals.md](proposals.md) |
| 6 · Verify (scripted) | The same audit again; fixed, new and open findings, deltas, model changes. A new warning fails. [scripts/compare.mjs](scripts/compare.mjs) |

## Run it

```bash
node bin/flow-tower.js examples/tower-optimizer        # open the tower
node bin/flow-tower.js audit examples/dev-squad        # rules and model fit, as text

cd examples/tower-optimizer
node scripts/snapshot.mjs ../dev-squad reports/dev-squad.before.json
# … apply the accepted proposals to the tower …
node scripts/snapshot.mjs ../dev-squad reports/dev-squad.after.json
node scripts/compare.mjs reports/dev-squad.before.json reports/dev-squad.after.json --md reports/dev-squad.compare.md
```

`snapshot.mjs` runs the CLI of the checkout it sits in, or `FLOW_TOWER_BIN` for an installed `flow-tower`.

## The worked run on dev-squad

[reports/](reports) holds real runs, not illustrations. On the [dev-squad](../dev-squad) example the run went like this:
- **Before:** the tower was audited ([before](reports/dev-squad.before.json)).
- **Applied:** the accepted proposals were applied to the tower itself:
  - a `sandbox` on the coder, tester, reviewer, verifier and built-in tools, for AUD11, declaring what the container and the worktree fences enforce today;
  - `fail: closed` on three decisions, for AUD04.
- **After:** the tower was audited again ([after](reports/dev-squad.after.json)).
- **Compared:** the [report](reports/dev-squad.compare.md) shows 9 warnings fixed, none new and 4 findings open, each with its reason. Its recommendations include network isolation for the container.

The other `reports/*.compare.md` files are the same run on the other example towers.

## Sources

The practices and the sources behind every rule and rubric line are in
[docs/best-practices.md](../../docs/best-practices.md) (S1-S12), among them Anthropic's
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), OpenAI's
[A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf),
OWASP's [LLM06:2025 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) and Microsoft's
[AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns).
OpenRouter categories as seen on [openrouter.ai/models](https://openrouter.ai/models) on 2026-10-12. Model ids and the
$1 budget in the tower are illustrative defaults, not measurements.
