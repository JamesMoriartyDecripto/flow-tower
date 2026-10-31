# Dev Squad

A coding squad that works your GitHub issues on **one OpenRouter key**. Your current coding session is the lead:
Claude Code, Codex, Pi, Hermes, Cursor or any agent that loads skills. It plans, writes one task file per step and
verifies. Nine specialist roles run through the Node runner in [`tools/squad`](../../tools/squad/README.md), each on
the OpenRouter model its `squad.json` names. A maintainer merges.

There is no SDK and no deployment. You need Node 22, git and an OpenRouter key; you do not need a Claude account.

This is the **canonical Dev Squad**. `flow-tower squad init <project>` installs this tower as
`tools/squad/squad.tower.yaml`, with the files below under `tools/squad/dev-squad/`.

## Open it

```bash
node bin/flow-tower.js examples/dev-squad/dev-squad.tower.yaml
```

Click a role to see its model, its rules and how to run it. The **coder** and the **run.mjs** node drill down into
the runner's tool loop.

## Use it on your project

```bash
node <flow-tower>/bin/flow-tower.js squad init ~/my-project    # runner, squad.json, this tower
node <flow-tower>/bin/flow-tower.js squad key                  # your OpenRouter key, into the user folder
node <flow-tower>/bin/flow-tower.js squad doctor ~/my-project  # local readiness, no paid call
node <flow-tower>/bin/flow-tower.js install-skill --target <claude|codex|pi|hermes|cursor|agents>
```

Then ask your session to work an issue with the Dev Squad. The [flow-tower-squad skill](../../skills/flow-tower-squad/SKILL.md)
is the lead's procedure.

## What is in this folder

| File | What it is |
|---|---|
| [`dev-squad.tower.yaml`](dev-squad.tower.yaml) | The design: eight layers from the issue to the maintainer's merge |
| [`towers/runner-loop.tower.yaml`](towers/runner-loop.tower.yaml) | One `run.mjs` process: config and key, mode, tool loop, write fence, step cap, report |
| [`roles/`](roles) | One card per role: what it may do, its default model, the command that runs it |
| [`squad.example.json`](squad.example.json) | A `tools/squad/squad.json`: commands, folders, base, rules, models per role |
| [`task-template.md`](task-template.md) | The shape of one step file, with the `Files:` line the runner checks |

## The flow

1. **Intake.** You pick the issue. Triage proposes `full`, `needs_info` or `reject`; the lead decides. Every change
   takes the full path. A sensitive area (auth, billing, payments, secrets, personal data) named in the title, body
   or areas needs your plan sign-off.
2. **Plan.** On a feature branch, the architect plans. The lead first updates the tower of the part it changes, then
   writes the task files: one or two items each, with a `Files:` line.
3. **Steps.** `steps.sh` runs the coder on each step: the project's check must pass and every `Files:` entry must be
   touched. Only the step's own files are committed; your uncommitted edits never are, and a rerun skips finished steps.
4. **Quality.** Reviewer and security answer in one packed request each, started together. The lead checks every
   finding in the code, fixes the real ones as new steps and records the dropped ones on the issue. The verifier
   checks the criteria with fresh context.
5. **Gate and merge.** `gate.mjs` says READY when CI is green and both verdicts approve the PR's exact head. You merge.

## Models

| Role | Default (OpenRouter) | Why |
|---|---|---|
| coder, triage, tester, doc writer | `anthropic/claude-haiku-5.5` | Field runs and the 2026-10-11 coder benchmark |
| reviewer, architect, researcher, verifier | `z-ai/glm-5.3-flash` | Same score as FlashX on the squad's review cases at a quarter of the price (#322) |
| security | `deepseek/deepseek-v4.1-flash` | Another family than coder and reviewer |

Any role takes its own model in `squad.json` (`"models": { "verifier": "..." }`); a role without one uses its family's.
Prices and scores move: see [skills/flow-tower-costs](../../skills/flow-tower-costs/SKILL.md) before changing them.

## Limits

- The lead is a person's session: there is no unattended runner yet (#320).
- No enforced global dollar cap: each run records its cost in the ledger, and the lead watches it.
- The write fence keeps writes inside the role's folders and the key out of child commands. It is not a sandbox for
  hostile code: run the squad on code and tests you trust.

## Sources

- Runner and its rules: [`tools/squad/README.md`](../../tools/squad/README.md).
- Model defaults: `tools/squad/config.mjs` (`DEFAULTS`), benchmark notes in #322.
- Harness trials (Pi, Claude Code, Codex): [docs/dev-squad-harness-trial.md](../../docs/dev-squad-harness-trial.md).
