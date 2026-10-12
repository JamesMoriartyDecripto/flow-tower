# tools/squad: the runner behind the dev squad

The small harness the maintainer drives by hand. Three scripts and a task file, no build step, no
dependency beyond Node and the flow-tower CLI. It is **not** the product: the product sample of a mixed-model
squad is [`examples/dev-squad`](../../examples/dev-squad/README.md) (a whole pipeline, meant to be read). This
folder is what actually ran the field sessions.

## Roles

| Role | Model | Why | Writes |
|---|---|---|---|
| Lead (Claude, you) | the session model | plans, verifies, commits | task files, commits |
| Coder | `anthropic/claude-haiku-5.5` | cleanest result, 11 steps (#126); `CODER_MODEL` overrides | `src/ tests/ e2e/` (or `--write a,b`) |
| Reviewer | `z-ai/glm-5.3-flashx` | 3 steps, cheapest on the same PR | nothing (read-only, JSON verdict) |
| Security | `deepseek/deepseek-v4.1-flash` | 6/6 in the benchmark, fastest | nothing |

All at low reasoning effort: quick passes, and the review rounds re-check the work. [OpenRouter](https://openrouter.ai) is just the gateway. Three families, so no reviewer shares the coder's blind spots.

## A task file

One or two items, never a whole issue. The coder has a step budget, and the Flash coder hit it twice on
multi-item tasks (#75). Small enough that a green `npm run check` means the item is done.

```markdown
# 113a: the runner takes --repo

Rules: English only; comments explain why; files under ~400 lines; never touch secret files.
Verify with `npm run check` (via `run check`), then `finish` with the output.

- In tools/squad/run.mjs resolve the repo from --repo, default the git root of the current directory.
- Writable: tools/ only.

Files: tools/squad/run.mjs
```

Header rules beat a long prompt: state the language, the comment rule, the file size, and the exact
verification command. End with `finish` and its report format, so the run has one exit.

## A step chain

```bash
git worktree add ../wt-113 -b fix/113-tools      # one worktree per task: two coders never share a checkout
tools/squad/steps.sh 113 tasks/113 tools "keep the squad runner in the repo"
```

`steps.sh <issue> <dir> <write-dirs> <title>` runs `run.mjs` on every `dir/*.md` in order, one commit per step.
`<write-dirs>` is a comma-separated list, same as `run.mjs --write` (e.g. `src,tests`). `REPO` picks the worktree
(default: this checkout). For simple tasks, `CODER_MODEL=openai/gpt-6-luna`. It stops at the first red step: a failed
coder run, no change at all, or a red `npm run check`. Each commit stages every changed tracked path (`git add -u`),
not a fixed list, so files like `package.json` or `NEXT.md` are never left out; new files are staged inside the
`write-dirs`, and anything untracked outside them is reported as `UNTRACKED LEFT (not committed)`. Probe files the
coder dropped (`tmp*`, `probe`, `scratch`) are removed first. Trailers are session-specific, so pass them in
`SQUAD_TRAILERS` (one per line) or leave them out.

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

## Field findings (#75)

- One or two items per task: the Flash coder burned its step cap on multi-item files.
- Refuse probe and scratch files at the tool: the coder left them despite the prompt. Use a real test file.
- Give it a delete tool, or it replaces a file it was told to remove with an empty placeholder.
- Let it dry-run `examples/*/scripts/*.mjs` with the key stripped, or it cannot verify a script at all.
- Fail the chain on a coder failure: a green check on unchanged code is not a done step.
- One commit per green step, per-path staging, never `git add -A` over the whole tree.

## Cost

Field trial #126, four coders on one task. Coder: Haiku 5.5 took 11 steps for $0.016 (DeepSeek Flash: 36 steps, $0.048).
Reviewer: GLM FlashX took 3 steps for $0.007 (DeepSeek: 16 steps, $0.058). The run reports its own total at `finish`
and the cache hit rate; method and older figures: [skills/flow-tower-costs/reference.md](../../skills/flow-tower-costs/reference.md).

## Where else to look

- `src/server/plugin.ts`, `src/server/secrets.ts`: how the key file and the user folder are found and guarded.
- `bin/flow-tower.js emit`: the event CLI `ev.sh` calls (never fails, never blocks long).
- `examples/dev-squad`: the product sample, a full squad in TypeScript, not this harness.
