---
name: flow-tower-squad
description: Set up and drive the Flow Tower dev squad on the user's own project - a cheap coder, a reviewer and a security auditor from three model families through OpenRouter, with the user's coding agent as the lead that plans, writes task files and verifies. Use when the user wants the dev squad / a coding squad / cheaper models to write code in their project, asks to set it up (`squad init`, OpenRouter key), or asks to run, review or check the cost of squad work.
---

# Flow Tower: the dev squad on your project

You are the **lead**. You plan, write one task file per step, run the squad, and verify. The squad's models write
the code; you do not, even for a one-line fix. CLI: `{{FLOW_TOWER_CLI}}`. Runner reference:
[tools/squad/README.md](../../tools/squad/README.md) (also copied into the project as `tools/squad/README.md`).

| Role | Default model (squad.json `models`) | Writes |
|---|---|---|
| Lead (you) | the session model | the tower, task files, commits, the issue |
| Coder | `anthropic/claude-haiku-5.5` | only the `write` folders of squad.json |
| Reviewer | `z-ai/glm-5.3-flashx` | nothing (JSON verdict) |
| Security | `deepseek/deepseek-v4.1-flash` | nothing (JSON findings) |

## Set up (once per project)

1. **Init**: `{{FLOW_TOWER_CLI}} squad init <project>` (a git repository). It copies the runner into
   `tools/squad/`, detects `tools/squad/squad.json` (check command, writable folders, base branch) and writes the
   task template and a ready tower. No check detected: `--check "<the command that proves a step works>"`.
   After a flow-tower update: `squad init <project> --force` refreshes the runner and keeps squad.json.
2. **Read squad.json with the user**: `project` (one line on the stack, it opens every model's prompt),
   `commands.check` (must pass after every step), `write` (what the coder may touch), `review`, `base`, `rules`
   (project rules every model sees). Fix what the detection got wrong before the first step.
3. **Key**: the user runs `{{FLOW_TOWER_CLI}} squad key` themselves (hidden input; stored in the flow-tower user
   folder, mode 600, never in the repo). `squad key status` says whether one is set. Never ask the user to paste a
   key into the chat, never print it, never write it in a file of the project.
4. **Commit the squad files** on the base branch before any worktree: `git add tools/squad .gitignore && git commit -m "chore: add the dev squad"`.
   Each worktree reads `tools/squad/squad.json` from its branch: without this commit it falls back to the defaults
   (`npm run check`, `src` and `tests`), and a project in another language goes red on the first step.
5. **Optional, live view**: `{{FLOW_TOWER_CLI}} <project>/tools/squad/squad.tower.yaml` with Flow Tower running:
   every coder, reviewer and security run lights its node.

## Work an issue

1. **Track it**: the issue (or a plan file the user keeps) holds the plan and the status; update it after every
   batch, review and fix.
2. **Branch**: never on the main branch. `git worktree add ../wt-<n> -b feat/<n>-<slug>` keeps each issue apart.
3. **Tower first**: if a tower (`*.tower.yaml`) models the part you change, update it before any task file, with
   the planned design: new or changed nodes, edges, `files` and descriptions. Validate it
   (`{{FLOW_TOWER_CLI}} validate <tower> --json`: 0 errors, 0 warnings), commit it, then write the steps from it.
   The tower is the design the user reads; YAML, so you write it, not the squad. No tower yet: offer one
   ([flow-tower skill](../flow-tower/SKILL.md)).
4. **Split** into steps of **one or two items** each (the coder has a step cap; multi-item steps fail). Each step
   small enough that a green check means it is done.
5. **Write each step** from `tools/squad/tasks/TEMPLATE.md` into its own folder (`tools/squad/tasks/<n>/01-….md`,
   zero-padded):
   - Rules line, the files to read first, `Verify: run check`, `finish` with a `Known gaps:` line;
   - why the step exists, with `file:line` and the **exact current text** of any message to change;
   - numbered items, then a new test file with the cases and expected results;
   - the `Files:` line: every file the step must touch (`+` new, `(optional)` may stay untouched). It is checked.
6. **Run**: `REPO=../wt-<n> bash tools/squad/steps.sh <n> tools/squad/tasks/<n> "" "<title>"` (empty write dirs
   take squad.json's). One commit per green step; it stops at the first red step (coder failure, no change, red
   check, a `Files:` entry not touched). Read the known gaps it prints before the next step.
7. **Verify yourself**: run the tests, run the real thing; for UI, look at it (screenshots). Green is not done.
   Check the tower still matches what landed (its files exist, its descriptions are true) and validate it again.
8. **Review and security**, one request each with the code packed, **started together**: they are independent and
   read-only, so you wait for the slower one, not for both in a row. Each run has its own log and ledger line.
   ```bash
   node tools/squad/pack.mjs --role reviewer --issue <n> --repo ../wt-<n> --files <changed files> > /tmp/<n>-review.md
   node tools/squad/pack.mjs --role security --issue <n> --repo ../wt-<n> --files <changed files>,<guards it relies on> > /tmp/<n>-security.md
   SQUAD_PACE=relaxed node tools/squad/run.mjs --model <reviewer> --role reviewer --node specialists.reviewer --task /tmp/<n>-review.md --issue <n> --repo ../wt-<n> > /tmp/<n>-review.out 2>&1 &
   SQUAD_PACE=relaxed node tools/squad/run.mjs --model <security> --role security --node specialists.security --task /tmp/<n>-security.md --issue <n> --repo ../wt-<n> > /tmp/<n>-security.out 2>&1 &
   wait
   ```
   Every finding quotes its line. Verify each one in the code: keep the real ones, say why the others do not apply.
9. **Fix steps** for the kept findings (same format, new folder), then verify again.
10. **Merge gate**: push, open the pull request, wait for CI, then
    `node tools/squad/gate.mjs --pr <PR> --review /tmp/<n>-review.out --security /tmp/<n>-security.out --repo ../wt-<n>`.
    A script, no model: READY only when every CI check passed, the pull request is mergeable and not a draft, the
    worktree is clean and at the pull request head, and both passes approve that head commit with no critical or high
    finding. Pack the passes from a clean tree (only then does `pack.mjs` write the commit the gate checks); after a
    fix step, pack and run them again. It lists **unverified findings** (the quote is not at that `file:line`, or too
    short to prove anything): treat them as possible hallucinations and check them in the code before acting. An
    unverified critical or high one still blocks: if it is not real, run that pass again. The gate never merges or
    approves: on READY, tell the user; the user merges.
11. **Cost**: `node tools/squad/cost.mjs <n>` prints the issue's total; report it with the result.
12. **Clean up** after the merge (or when the work is dropped): `git worktree remove ../wt-<n>`, delete the local branch,
    stop any scratch server. Nothing of the issue stays on the user's disk.

## Pace

Ask how urgent it is. Waiting: the default loop, no batch. No hurry today: `SQUAD_PACE=relaxed` for review and
security (one request, cents). Unattended: `SQUAD_PACE=overnight` (batch, about half price, can wait hours).
The coder always runs the loop. Details: [tools/squad § Pace](../../tools/squad/README.md#pace-how-fast-versus-how-cheap).

## Field lessons

- Never let a step rewrite or empty an existing test file: say "append new cases" in the task.
- A task that rewords a message breaks the test asserting it: quote the current text in the task.
- OpenRouter 504/429 mid-step: discard the partial changes (`git checkout -- . && git clean -fd` in the worktree)
  and rerun that step. A security pass that answers empty: rerun once, then use the reviewer model with the
  security brief.
- Tests that spawn a CLI or a server need explicit timeouts.
- A step left red with useful changes: write the next step to finish them ("keep that work") instead of starting over.

## Never

- Write the code yourself instead of a squad step, or skip your own verification.
- Write a task file before the tower that models the change, if one exists, is updated and valid.
- Put keys, tokens or the contents of key files in task files, issues, commits or output.
- Widen `write` to the runner (`tools/squad/`), CI config or secrets to make a step pass.
- Work on the main branch, or merge without the user.
