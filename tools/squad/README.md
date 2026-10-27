# tools/squad: the dev squad runner

A cheap coder, a reviewer and a security auditor from three model families, driven by your coding agent as the
lead. A few scripts and a task file, no build step, no dependency beyond Node, git and an OpenRouter key. It ran
every field session of this repo, and it runs on **your own project** too (#265):

```bash
node <flow-tower>/bin/flow-tower.js squad init ~/my-project   # runner into tools/squad/, squad.json detected
node <flow-tower>/bin/flow-tower.js squad key                 # your OpenRouter key, into the user folder
node <flow-tower>/bin/flow-tower.js install-skill             # the flow-tower-squad skill for your agent
git -C ~/my-project add tools/squad .gitignore && git -C ~/my-project commit -m "chore: add the dev squad"
```

Commit what init wrote before the first step: each worktree reads `tools/squad/squad.json` from its branch.

Then ask your agent to work an issue with the squad: the [flow-tower-squad skill](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/skills/flow-tower-squad/SKILL.md)
is the lead's procedure. `tools/squad/squad.json` holds what is specific to a project (below). The design sample of a
bigger, unattended squad on the Claude Agent SDK is [`examples/dev-squad`](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/examples/dev-squad/README.md) (meant to be read).

## squad.json

Read by `run.mjs`, `oneshot.mjs`, `pack.mjs` and `steps.sh` from `<repo>/tools/squad/squad.json`; `squad init` writes
it from what the project's files say. A missing file gives the defaults.

| Key | Meaning | Default |
|---|---|---|
| `project` | one line on the stack; it opens every model's system prompt | empty |
| `commands` | `check` (required: must pass after every step), optional `typecheck`, `test` (`{file}` is the test file), `lint`. Split on spaces and run without a shell: no pipes or quotes (wrap them in a package script) | `check: npm run check` |
| `write` | folders the coder may write | `src, tests` |
| `review` | folders the review diff covers | `src` |
| `base` | the branch diffs are taken against | `origin/main` |
| `rules` | extra lines every model sees, after the shared style line (`STYLE_RULES` in `config.mjs`: language, comments, file size, efficiency without added complexity) | none |
| `extras` | flow-tower-only tools (`validate`, `dryrun`) | none |
| `models` | `coder`, `reviewer`, `security` | the table below |
| `tower`, `source`, `cli` | the tower name the live events go to, their source, the flow-tower CLI path | `Dev Squad`, `dev-squad`; the CLI from `FLOW_TOWER_CLI`, then `tools/squad/.cli` (written by init, git-ignored), then PATH |

## Roles

| Role | Model | Why | Writes |
|---|---|---|---|
| Lead (Claude, you) | the session model | plans, verifies, commits | task files, commits |
| Coder | `anthropic/claude-haiku-5.5` | cleanest result, 11 steps (#126); `CODER_MODEL` overrides | the `write` folders of squad.json (or `--write a,b`) |
| Reviewer | `z-ai/glm-5.3-flashx` | 3 steps, cheapest on the same PR | nothing (read-only, JSON verdict) |
| Security | `deepseek/deepseek-v4.1-flash` | 6/6 in the benchmark, fastest | nothing |

All at low reasoning effort: quick passes, and the review rounds re-check the work. [OpenRouter](https://openrouter.ai) is just the gateway. Three families, so no reviewer shares the coder's blind spots.

## A task file

One or two items, never a whole issue. The coder has a step budget, and the Flash coder hit it twice on
multi-item tasks (#75). Small enough that a green check (`commands.check`) means the item is done.

```markdown
# 113a: the runner takes --repo

Rules: English only; comments explain why; files under ~400 lines; never touch secret files.
Verify with the project's check (via `run check`), then `finish` with the output.

- In tools/squad/run.mjs resolve the repo from --repo, default the git root of the current directory.
- Writable: tools/ only.

Files: tools/squad/run.mjs
```

Header rules beat a long prompt: state the language, the comment rule, the file size, and the exact
verification command. End with `finish` and its report format, so the run has one exit.

The `Files:` line is a contract, checked after the step (`files-check.mjs`): every entry must appear in the step's
changes (tracked diff since the step started, plus new untracked files), else the step is RED with the missing paths.
Green tests alone are not enough: on #65 a step passed its own tests with half its task missing (#176). Entries are
comma-separated; a directory or a glob (`*` within one segment, `**` any depth) is satisfied by any changed path under or
matching it; a trailing `+` marks a new file; `(optional)` drops the entry from the check. Only the last `Files:` line counts.

Coders end their report with `Known gaps:` (or `Known gaps: none`); `steps.sh` prints them under each step, and the
lead reads them before the next step: gaps never stop the chain.

## A step chain

```bash
git worktree add ../wt-113 -b fix/113-tools      # one worktree per task: two coders never share a checkout
tools/squad/steps.sh 113 tasks/113 tools "keep the squad runner in the repo"
# after the merge, from the main checkout: nothing stays behind (stop any scratch server by the PID on its port too)
git -C ../wt-113 status -s && git -C ../wt-113 log @{u}..   # both empty, or ask before going on
git worktree remove ../wt-113 && git branch -d fix/113-tools
```

`steps.sh <issue> <dir> <write-dirs> <title>` (bash) runs `run.mjs` on every `dir/*.md` in order, one commit per step.
`<write-dirs>` is a comma-separated list, same as `run.mjs --write` (e.g. `src,tests` or `tools/squad`). `REPO` picks the worktree
(default: this checkout); `NODE` picks the Node binary (default `node`; e.g. `NODE=/opt/node22/bin/node` where the
system Node is older than 22). For simple tasks, `CODER_MODEL=openai/gpt-6-luna`. It stops at the first red step: a failed
coder run, no change at all, a red check, or a `Files:` entry the step did not touch. Each commit stages every changed tracked path (`git add -u`),
not a fixed list, so files like `package.json` or `NEXT.md` are never left out; new files are staged inside the
`write-dirs`, and anything untracked outside them is reported as `UNTRACKED LEFT (not committed)`. Probe files the
coder dropped (`tmp*`, `probe`, `scratch`) are removed first. Trailers are session-specific, so pass them in
`SQUAD_TRAILERS` (one per line) or leave them out. Each step commit is signed off (`git commit -s`, the DCO rule in CONTRIBUTING.md) with the git identity of whoever runs the squad.

`run.mjs` needs `OPENROUTER_API_KEY`: the environment, else `~/.config/flow-tower/.env` (or `FLOW_TOWER_HOME`), else the
git-ignored `.env` of the checkout. The key never leaves the process and is never printed. `--node specialists.coder`
names the tower node that shows the run live; `ev.sh` posts those events to `FLOW_TOWER_URL` (default
`http://127.0.0.1:5317`) and is silent when no tower listens.

## A review

```bash
node tools/squad/run.mjs --model z-ai/glm-5.3-flashx --role reviewer --node specialists.reviewer \
  --task tasks/113-review.md --steps 20 --repo ../wt-113
```

The reviewer is read-only, so put everything it needs in the task: the diff (`git diff origin/main`) embedded as text,
the item it was meant to fulfil, and the answer format (JSON with a `verdict` and a finding list, each finding
`file:line`, what is wrong, why it matters, a fix). Read the log afterwards: `role-*.log` next to the script holds
every call.

```bash
node tools/squad/run.mjs --model deepseek/deepseek-v4.1-flash --role security --node specialists.security \
  --task tasks/113-security.md --steps 10 --repo ../wt-113
```

Start the review and the security pass together (each in the background, then `wait`): both are read-only and
independent, so the wait is the slower of the two. Each run writes its own `role-*.log` and its own ledger line.

## The merge gate

```bash
node tools/squad/gate.mjs --pr 300 --review /tmp/299-review.out --security /tmp/299-security.out --repo ../wt-299
```

The last check before you merge, and a script, not a model, so it cannot hallucinate. It reads `gh pr checks`,
`gh pr view` and `git rev-parse HEAD`, parses the two passes' answers and prints `READY` (exit 0) or `NOT READY`
(exit 1) with one line per reason: a CI check not passed, a draft, a pull request that is not mergeable, a worktree not
at the pull request head or with uncommitted changes, a missing or `changes` verdict, a pass that did not review the
pull request head, a critical or high finding. It never merges and never approves.

Only a packed review counts. `pack.mjs` writes `Reviewed commit: <sha>` on the task's third line when the tree is
clean (it leaves the line out, with a warning, when it is not: the diff would hold uncommitted edits). `run.mjs`
prints it back as the second line of its output, `reviewed: <sha>`, right after `mode:`. The gate reads that line
only there, so a `reviewed:` line a model writes in its answer counts for nothing. Without a commit (a tool-loop
review, a pack from a dirty tree) the runner prints `reviewed: none`, so line 2 is never the model's, and the gate
refuses that review: a file's age proves nothing about what it reviewed.

Every finding must quote its line (`pack.mjs` asks for it). The gate looks for the quote within 3 lines of the cited
`file:line`, ignoring spacing and a copied `+`/`-` diff marker, reading only files inside the repo and never secret
ones. A quote under 8 characters, or with no letter or digit, proves nothing (`}` matches anywhere) and counts as
unverified too. A finding whose quote is not there is listed as **unverified**: a line the model may have made up.
Nobody acts on one before checking it in the code. Below high it does not block, since a wrong quote should not stop a
good change. A critical or high one blocks even unverified: check it, and if it is not real, run the pass again (a
made-up finding rarely comes back).

## The PR steward

One local command reviews and gates the open pull requests: the sequence of the two sections above, for each one.

```bash
node tools/squad/prs.mjs                 # every open pull request
node tools/squad/prs.mjs --pr 300,301    # only these
node tools/squad/prs.mjs --dry-run       # what it would do: head, base, issue tag, output folder, cached or new
```

For each pull request it fetches the head (`pull/<n>/head`) and the base, adds a detached worktree `wt-pr-<n>` in its own folder (below), packs
the review and the security task against the PR's own base (stacked PRs too) with the PR text and the issue it closes
(`Closes #n`) as brief, runs both passes at once (`SQUAD_PACE` from the environment, else `relaxed`), and runs the gate.
An empty or cut answer is run once more; a second failure of the security model sends the security brief to the reviewer
model (§ Pace). The runs are tagged with the linked issue, else the PR number, so `cost.mjs` sums them.

It prints one table row per PR (head, both verdicts with findings by severity, the gate, the cost), the gate's reasons
for each NOT READY one, and its folder: `squad-prs/` next to the cost ledger (the flow-tower user folder, mode 700), with one
`pr-<n>-<head>/` per review (brief, packed tasks, `review.out`, `security.out`) and the worktrees. Changed files up to
40 KB go in full into the tasks, bigger ones (a CHANGELOG) only through the diff, so one big file never pushes the others
out; a file name with a comma, a symlink or another non-regular file is left out of the task with a line saying so, and the
brief lists it under `## Left out of this task` so both passes know the PR holds it. A head that already has both outputs, each with a readable verdict, is not reviewed again unless `--force`, so a repeated
run costs nothing until a PR changes. The worktree is removed at the end, on failure too, unless `--keep`; an existing
`wt-pr-<n>` (or a symlink there) is never touched (that PR is skipped). A PR whose fetched head differs from the head
GitHub reports (a push seconds before) is skipped with `the PR moved, run again`, before any model call; a PR that `gh`
cannot read gets its own error line and the others go on. Run one steward at a time: two at once would race for the same
worktree name.

It only reads and reviews: it never merges, approves, comments, pushes or marks a PR ready. The lead reads the
report, checks every finding in the code, keeps or drops it with a reason, writes fix steps, and runs it again.

## Pace: how fast versus how cheap

The maintainer sets the pace; the lead picks the review mode from it. The coder always runs the tool loop: it reads,
writes and runs the check over many steps, which no single request can do.

| Pace | When | Reviewer and security | Cost | Wait |
|---|---|---|---|---|
| `now` (default) | the maintainer is waiting, or a security pass must read the repo | tool loop (`run.mjs`, as below) | full price, grows with each step | minutes |
| `relaxed` | daytime, no hurry: most issues | `SQUAD_PACE=relaxed`: `--oneshot`, one direct request with the code packed | full price for one request ($0.008–0.011 on #164/#169) | a few minutes |
| `overnight` | work left to run unattended (overnight, a weekend) | `SQUAD_PACE=overnight`: `--batch`, the same request through the OpenRouter Batch API | about half | median minutes, but the first real run sat `in_progress` for 30+ min; cap 24 h |

**In a hurry, also pick faster models** (benchmark and field numbers in the [cost skill reference](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/skills/flow-tower-costs/reference.md#benchmark-2026-10-11)); the defaults stay, because speed can cost quality:

| Role | Default | Faster | Use the faster one when |
|---|---|---|---|
| Coder | `anthropic/claude-haiku-5.5` (212 s on #126) | `CODER_MODEL=openai/gpt-6-luna` (67 s, but missed the size goal) | the task is simple and mechanical |
| Reviewer | `z-ai/glm-5.3-flashx` | none: GLM is already the fastest that found the real issue (Gemini Flash-Lite approved it blind) | — |
| Security | `deepseek/deepseek-v4.1-flash` (6/6) | `openai/gpt-6-luna` (5/6, 8 s) | the change does not touch auth, tokens, paths or anything a remote request reaches |

Never batch in a hurry: `now` and `relaxed` never touch the Batch API.

`--oneshot` and `--batch` have no tools: the task must hold the code. Build it with `pack.mjs`:

```bash
node tools/squad/pack.mjs --role security --issue 164 --files src/server/enroll.ts,src/server/shared-towers.ts > tasks/164-security.md
node tools/squad/pack.mjs --role reviewer --issue 249 --paths src,examples > tasks/249-review.md
SQUAD_PACE=relaxed node tools/squad/run.mjs --model deepseek/deepseek-v4.1-flash --role security --node specialists.security --task tasks/164-security.md --issue 164
```

- **DeepSeek 4.1 Flash can answer empty in `--oneshot`** (2026-10-13: four of five security passes on #189-#194 returned `empty answer`). Re-run it once; if it is empty again, run the same packed task with the reviewer model and the security brief, and say so in the PR. The same day of #316 it also cut answers in the middle of the JSON: a oneshot or batch answer whose `finish_reason` is present and not `stop` now fails the run (`truncated answer`, ledger outcome `truncated-answer`) instead of passing as a normal one; treat it like an empty answer.
- **`--paths a,b` picks what the diff covers** (default: squad.json `review`). A change under `examples/` or `docs/`
  needs it, or the reviewer gets an empty diff. Paths are read literally (no globs, no `:(magic)`), and a changed file
  that looks like a secret (`.env*`, `*.pem`, `*.key`, `id_rsa*`...) is left out of the diff and named on stderr.
- **Pack with `--base <the PR's base branch>` on a stacked PR**: against `origin/main` the diff holds the whole stack and gets cut, and the reviewer never sees the files of this PR.
- **Not every model has a batch endpoint.** GLM 5.3 FlashX has none on OpenRouter (2026-10-12); DeepSeek 4.1 Flash does.
  `--batch` on such a model prints `has no batch endpoint: falling back to --oneshot (full price)` and runs it as a oneshot.
- **Pick `--oneshot` over the loop** when the diff is big: on #164 the security loop timed out three times on the 180 s
  per-call cap as its context grew, while one request with the code embedded answered in 2.5 minutes for $0.011.
- **A one-request review sees only what you packed.** It cannot follow a call into a file you left out, so pack every
  file the change touches and, for security, the guards it relies on. When it finds something, verify it in the code
  before acting: on #164 two of five security findings did not apply.
- **Ctrl-C while a batch waits** deletes the batch before the runner exits; a failed poll is retried twice, then the run
  fails instead of waiting out the 12 h deadline.
- **The Batch API keeps inputs and results up to 30 days** unless deleted. The runner always deletes the batch after
  reading it, and only this public repo's diffs go through it, never a task that holds a secret.
- The ledger line records `mode` (`loop`, `oneshot`, `batch`), so `cost.mjs` shows what each pace cost.

## Field findings (#75)

- One or two items per task: the Flash coder burned its step cap on multi-item files.
- Refuse probe and scratch files at the tool: the coder left them despite the prompt. Use a real test file.
- Give it a delete tool, or it replaces a file it was told to remove with an empty placeholder.
- Let it dry-run `examples/*/scripts/*.mjs` with the key stripped, or it cannot verify a script at all.
- Fail the chain on a coder failure: a green check on unchanged code is not a done step.
- One commit per green step, per-path staging, never `git add -A` over the whole tree.

## Field findings (#176: 60+ steps on #164, #165, #169, #65)

- Green is not done: check the task's `Files:` against the diff (above), and read the coder's known gaps.
- Big context goes oneshot: a tool loop whose context keeps growing times out; pack the code and send one request
  (`pack.mjs` + `--oneshot`, § Pace).
- Code passed to Playwright's `page.evaluate` runs as plain JS: a coder wrote `querySelectorAll<HTMLElement>(…)`, which
  ran as a comparison. The coder's system prompt says so.
- Prefix the CSS classes of a printed document (`doc-summary`, not `summary`): one bare class styled a page-breaking
  section and a table cell, giving one table row per page.
- The lead looks at rendered output after every UI or print step (Playwright screenshots, `pdftoppm` pages): most real
  bugs on #65 were visible only there, never in a green check.

## Cost

Field trial #126, four coders on one task. Coder: Haiku 5.5 took 11 steps for $0.016 (DeepSeek Flash: 36 steps, $0.048).
Reviewer: GLM FlashX took 3 steps for $0.007 (DeepSeek: 16 steps, $0.058). The run reports its own total at `finish`
and the cache hit rate; method and older figures: [skills/flow-tower-costs/reference.md](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/skills/flow-tower-costs/reference.md).

## Cost per issue

Every run (coder, reviewer, security, failed runs too) appends one line to `~/.config/flow-tower/squad-costs.jsonl`
(`SQUAD_LEDGER` overrides the path). The run is tagged with `--issue <n>`, or with the number in the branch name.
`steps.sh` adds a `Squad-Cost: $0.0123` trailer to each step commit. To see an issue's total:

```bash
node tools/squad/cost.mjs 156          # Markdown block; --json for the raw summary
```

The lead posts that table on the issue when it closes.

## Where else to look

- In flow-tower: [`src/server/plugin.ts`](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/src/server/plugin.ts) and [`src/core/secrets.ts`](https://github.com/JamesMoriartyDecripto/flow-tower/blob/main/src/core/secrets.ts), how the key file and the user folder are found and guarded.
- `bin/flow-tower.js emit`: the event CLI `ev.sh` calls (never fails, never blocks long).
- `examples/dev-squad`: the product sample, a full squad in TypeScript, not this harness.
