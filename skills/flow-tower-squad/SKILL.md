---
name: flow-tower-squad
description: Set up and drive the complete Flow Tower Dev Squad from the user's existing Pi, Codex, Claude Code, Hermes or other skill-capable harness, with configurable OpenRouter specialist models and shared verification gates. Use when the user wants the dev squad / a coding squad / cheaper models to write code in their project, asks to set it up (`squad init`, OpenRouter key), or asks to run, review or check the cost of squad work.
---

# Flow Tower: the dev squad on your project

You are the **lead in the user's current harness**. The squad depends on no SDK: every specialist runs through the Node runner on one OpenRouter key.
You plan, write one task file per step, run the squad, and verify. The squad's models write
the code; you do not, even for a one-line fix. CLI: `{{FLOW_TOWER_CLI}}`. Runner reference:
[tools/squad/README.md](../../tools/squad/README.md) (also copied into the project as `tools/squad/README.md`).

| Role | Default model (squad.json `models`) | Writes |
|---|---|---|
| Lead (you) | the session model | the tower, task files, commits, the issue |
| Triage | `models.triage`, otherwise coder model | nothing |
| Architect | `models.architect`, otherwise reviewer model | nothing |
| Researcher | `models.researcher`, otherwise reviewer model | nothing |
| Coder | `models.coder` (default `anthropic/claude-haiku-5.5`) | configured `write` folders |
| Tester | `models.tester`, otherwise coder model | no direct file tools; may run project checks |
| Reviewer | `models.reviewer` (default `z-ai/glm-5.3-flash`) | nothing (JSON verdict) |
| Security | `models.security` (default `deepseek/deepseek-v4.1-flash`) | nothing (JSON findings) |
| Verifier | `models.verifier`, otherwise reviewer model | nothing |
| Doc writer | `models.doc-writer`, otherwise coder model | explicit `--write` folders only |

Set a model for each role in `squad.json`; `--model` overrides it for one invocation. The family defaults for
new roles are starting points, not benchmark claims. Model routing is independent of the lead harness.
No Claude account, SDK installation or Claude-specific permissions are required by the portable runner.
This is a lead-driven procedure. For issues nobody needs to watch, `node tools/squad/runner.mjs` (#320) runs the same procedure unattended: label an issue `squad:go`, and it stops at a draft PR or with `squad:failed` and the reason (see tools/squad/README.md). A sensitive area still needs you as lead. Skill installation does not prove that every
harness has been exercised: check the recorded trials before claiming support.

## Set up (once per project)

1. **Init**: `{{FLOW_TOWER_CLI}} squad init <project>` (a git repository). It copies the runner into
   `tools/squad/`, detects `tools/squad/squad.json` (check command, writable folders, base branch) and writes the
   task template and the complete canonical eight-layer Dev Squad tower at `tools/squad/squad.tower.yaml`.
   Its role cards, sample config, task template and nested runner tower go in `tools/squad/dev-squad/`.
   No check detected: `--check "<the command that proves a step works>"`.
   After a flow-tower update: `squad init <project> --force` refreshes the runner, fills missing bundle files and
   keeps squad.json, existing towers and bundle edits. To migrate an old reduced tower, back it up, remove the
   installed `squad.tower.yaml`, rerun init with `--force`, then review and port your customizations.
   Run `{{FLOW_TOWER_CLI}} squad doctor <project>` to check Node, git, runner/config and OpenRouter credentials.
   Install this skill using the documented skill target for your harness; keep using the current session as lead.
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

## Complete role workflow

Before implementation, **triage** the issue (scope, acceptance criteria, risks), ask the **architect** for a plan,
and use the **researcher** where facts or APIs need evidence. The lead saves their results in the issue/plan;
read-only specialists return reports rather than editing it. Skip a role only with an explicit reason recorded
in the issue (for example, no unknown dependencies to research), not by silently using a second quickfix pipeline.

Run any specialist through the same runner, from the project containing the installed tools:

```bash
node tools/squad/run.mjs --repo ../wt-<n> --role architect --task /tmp/<n>-plan.md --issue <n>
node tools/squad/run.mjs --repo ../wt-<n> --role tester --task /tmp/<n>-test.md --issue <n>
node tools/squad/run.mjs --repo ../wt-<n> --role doc-writer --write docs --task /tmp/<n>-docs.md --issue <n>
```

The role selects its canonical tower node and configured model. Triage/architect/researcher/coder/tester/
verifier/doc-writer use tool loops; only reviewer/security support the packed one-request and batch paths.
Task files are supplied by the lead (they may be outside the repository); file tools cannot read arbitrary
external paths. Put necessary non-secret context in the task or tracked project files.

After each coder step, the **tester** runs the agreed checks and reports failures, then the lead verifies them
independently. Run **doc-writer** for documentation, release notes and draft PR text with explicit narrow write
folders. After all changes, run review/security against the final commit, then **verifier** compares the result
with the issue's acceptance criteria. Any fix invalidates old review evidence: rerun the affected checks and both
final-commit passes. The lead owns approvals, budget decisions, publication and the final human handoff.

The runner's path guards constrain direct file tools, **not arbitrary side effects of project test commands**.
All loop roles can invoke configured checks; tests may write build artifacts or execute project code. Use only
trusted repositories, use OS/container isolation where needed, and never describe these controls as a sandbox.
There is no enforced global issue spending cap yet: use small `--steps` bounds, inspect the cost ledger after each
run and stop for approval before exceeding the agreed budget. Do not advertise prompt-only limits as enforcement.

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
   check, a `Files:` entry not touched). Rerunning the folder skips steps already committed. Only the step's own
   files are committed (its write dirs, the folders of its `Files:` entries); edits you had before the run stay out.
   List any root file the step changes (`package.json`, `CHANGELOG.md`) in `Files:`. Read the known gaps it prints
   before the next step.
7. **Verify yourself**: run the tests, run the real thing; for UI, look at it (screenshots). Green is not done.
   Check the tower still matches what landed (its files exist, its descriptions are true) and validate it again.
8. **Review and security**, one request each with the code packed, **started together**: they are independent and
   read-only, so you wait for the slower one, not for both in a row. Each run has its own log and ledger line.
   ```bash
   node tools/squad/pack.mjs --role reviewer --issue <n> --repo ../wt-<n> --files <changed files> > /tmp/<n>-review.md
   node tools/squad/pack.mjs --role security --issue <n> --repo ../wt-<n> --files <changed files>,<guards it relies on> > /tmp/<n>-security.md
   node tools/squad/run.mjs --model <reviewer> --role reviewer --node quality.reviewer --task /tmp/<n>-review.md --issue <n> --repo ../wt-<n> > /tmp/<n>-review.out 2>&1 &
   node tools/squad/run.mjs --model <security> --role security --node quality.security --task /tmp/<n>-security.md --issue <n> --repo ../wt-<n> > /tmp/<n>-security.out 2>&1 &
   wait
   ```
   Both answer in one request with the packed code (the default) and only with the JSON verdict: an answer without
   one fails the run (`no JSON verdict`); rerun it once. `--loop` gives a pass tools to read files you did not pack.
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
    **Someone else's pull request**: use the steward, or `--repo` of your own checkout with the task packed from the
    PR. `run.mjs` ignores the `cli` of a `--repo` it does not live in (`squad.json "cli" ignored`, #324), so live events
    never run a PR's code; but a `--loop` pass there would still run that repo's `check`, so never `--loop` on it.
    **Several open pull requests**: `node tools/squad/prs.mjs` (README § The PR steward) runs pack, both passes with
    the fallback rule and the gate for each one and prints one row per PR; you still check every finding in the code.
11. **Cost**: `node tools/squad/cost.mjs <n>` prints the issue's total; report it with the result.
12. **Clean up** after the merge (or when the work is dropped), from the main checkout: check the worktree has no
    uncommitted or unpushed work (`git -C ../wt-<n> status -s`, `git -C ../wt-<n> log @{u}..`) and ask if it has, then
    `git worktree remove ../wt-<n>` (it refuses a dirty one: never `--force` it away), delete the local branch and
    stop any scratch server by the PID on its port. Nothing of the issue stays on the user's disk.

## Pace

Ask how urgent it is. Waiting or not, review and security are one request each (seconds, a fraction of a cent).
Unattended: `SQUAD_PACE=overnight` (batch, about half price, can wait hours).
The coder always runs the loop. Details: [tools/squad § Pace](../../tools/squad/README.md#pace-how-fast-versus-how-cheap).

## Field lessons

- Never let a step rewrite or empty an existing test file: say "append new cases" in the task.
- A task that rewords a message breaks the test asserting it: quote the current text in the task.
- OpenRouter 504/429 mid-step: inspect and preserve useful partial changes; write a continuation step or ask
  before discarding anything. A security pass that answers empty: retry once; if a different model is needed,
  report the failure and get approval for the substitution rather than silently changing providers/models.
- Tests that spawn a CLI or a server need explicit timeouts.
- A step left red with useful changes: write the next step to finish them ("keep that work") instead of starting over.

## Never

- Write the code yourself instead of a squad step, or skip your own verification.
- Write a task file before the tower that models the change, if one exists, is updated and valid.
- Put keys, tokens or the contents of key files in task files, issues, commits or output.
- Widen `write` to the runner (`tools/squad/`), CI config or secrets to make a step pass.
- Work on the main branch, or merge without the user.
