---
name: flow-tower-contribute
description: Turn the user's own Flow Tower (`*.tower.yaml`) into an anonymised, self-contained example and propose it for the Flow Tower examples gallery with a pull request. Use when the user wants to contribute, share or publish a tower, or asks how to make a tower an example for the examples gallery / examples.
---

# Flow Tower: contribute a tower to the examples gallery

CLI: `{{FLOW_TOWER_CLI}}` (setup: see the [flow-tower skill](../flow-tower/SKILL.md)). Rules: [CONTRIBUTING.md](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/CONTRIBUTING.md). Details, checklists and exact commands: [reference.md](reference.md).

## Steps

1. **Open an issue** with the "Example tower" form (`gh issue create -R JamesMoriartyDecripto/flow-tower --template example.yml`, or the web form). Wait for the maintainer's go before the PR: a tower that does not fit the gallery is cheaper to hear about first.
2. **Build or generate the tower** with the [flow-tower skill](../flow-tower/SKILL.md); validate it to 0/0.
3. **Turn it into an example** in its own folder:
   - **anonymise**: no personal paths, host names, IPs, emails, tokens or keys; real company and customer data replaced with realistic placeholders ([checklist](reference.md#anonymisation-checklist));
   - **self-contained**: no `root: ../..`, every referenced file inside the folder;
   - **README** with what it shows, how to run it and `## Sources` ([template](reference.md#readme-template)); illustrative numbers labelled.
4. **Pre-flight**: `flow-tower check-example <dir>` until it passes (`--json` for machine output).
5. **Pick its section** in `examples/README.md` and write its row ([section guide](reference.md#section-guide)).
6. **Propose it**: fork, add the `upstream` remote, branch `examples/<name>`, add the folder and the row, add a line under `[Unreleased]` → `Added` in `CHANGELOG.md`, `npm run check`, commit with sign-off (`git commit -s`) and a Conventional Commit message, then open a small PR whose body is the repo template ([PR checklist](reference.md#pr-checklist)), with `Fixes #<issue>` and the "Example tower" block filled in, saying an AI agent helped. Commands: [reference.md](reference.md#commands).
7. **Review**: answer each comment, push fixes as new commits to the same branch.

**Ask the user before opening the issue and before forking or opening the PR**: both are public and publish their work. Show them the diff and the check-example result first.
