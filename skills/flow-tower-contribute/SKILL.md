---
name: flow-tower-contribute
description: Turn the user's own Flow Tower (`*.tower.yaml`) into an anonymised, self-contained example and propose it for the Flow Tower examples library with a pull request. Use when the user wants to contribute, share, publish or add their tower to the library / examples, or asks how to make a tower an example.
---

# Flow Tower: contribute a tower to the library

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)). Details, checklists and exact commands: [reference.md](reference.md).

## Steps

1. **Build or generate the tower** with the [flow-tower skill](../flow-tower/SKILL.md); validate it to 0/0.
2. **Turn it into an example** in its own folder:
   - **anonymise**: no personal paths, host names, IPs, emails, tokens or keys; real company and customer data replaced with realistic placeholders ([checklist](reference.md#anonymisation-checklist));
   - **self-contained**: no `root: ../..`, every referenced file inside the folder;
   - **README** with what it shows, how to run it and `## Sources` ([template](reference.md#readme-template)); illustrative numbers labelled.
3. **Pre-flight**: `flow-tower check-example <dir>` until it passes (`--json` for machine output).
4. **Pick its section** in `examples/README.md` and write its row ([section guide](reference.md#section-guide)).
5. **Propose it**: fork, branch `examples/<name>`, add the folder and the row, `npm run check`, then a PR with the [checklist](reference.md#pr-checklist) ([commands](reference.md#commands)).

**Ask the user before forking or opening the PR**: it publishes their work. Show them the diff and the check-example result first.
