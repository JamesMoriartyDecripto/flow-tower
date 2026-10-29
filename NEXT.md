# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## In flight: portable Dev Squad trials (#333, #334)

- **Do not resume the superseded Claude-SDK-only installer direction.** The user's existing harness is lead;
  shared Node/OpenRouter specialists select models per role. No required Claude SDK/authentication.
- PR #331 (canonical full tower) is unmerged. Draft PR #335 is stacked on its branch and adds portable doctor,
  nine specialist roles and the complete lead skill. Maintainer merges bottom-up only after final reviews/gate.
- Pi local full-role trial passed: 9 calls, 21 steps, reported specialist cost $0.0073 (lead cost excluded).
  No external PR, CI gate or universal harness claim. Source/test/docs and clean trial head independently checked.
- Claude Code trial: code passed; researcher hit its 3-step cap and verifier hit its 5-step cap twice.
  Prose PASS without `finish` is not role completion; evidence and commit `21fad55` preserved.
- Codex baseline repeat (2026-10-29), implementation `21fad55`: all nine roles explicitly finished,
  20 steps, reported specialist cost $0.008795. Independent 12/12 tests and clean head `89345da`;
  reviewer/security approved that head. Runner unchanged; no external repo/PR/push/merge.
- **Next session:** [docs/dev-squad-harness-trial.md](docs/dev-squad-harness-trial.md) records all three hosts.
  Hermes remains untested; #333's broader acceptance remains open. Preserve Pi/Claude Code/Codex evidence.
  Investigate the recorded cap/report-loss gap separately from these baseline trials.
- #333 remains open for cross-harness and full draft-PR acceptance; #334/#332 implementation is partial.
  Global enforced spending limits, hostile-code isolation and unattended execution are not proven by this trial.

## Status on 2026-10-27

- **Working model** (maintainer, 2026-10-27): the squad develops, the lead checks and measures, never infers. A PR goes to `main` when the lead's review and the PR steward agree; the maintainer runs the merge. Every tower here must work on any harness and come optimized with ready OpenRouter models: the day's work is the towers' training ground, so a flaw found in real work is fixed in the tower or runner it belongs to.
- **PR steward** (#319, PR #321, merged). `node tools/squad/prs.mjs [--pr n,m] [--force] [--keep] [--dry-run]` reviews and gates the open PRs: a detached worktree at each head, both passes packed against the PR's own base with the PR text (labelled as data) and its linked issue, the fallback rule in code (an empty or cut answer runs once more, then the security brief goes to the reviewer model), the gate, one row per PR with an unverified-quotes column. Outputs and worktrees live in the user folder (`squad-prs/`, 700), keyed by head and merge base; `squad init` installs it; the squad tower has a steward layer.
  - It reviewed its own PR seven times; every round but the last found a real defect. The serious one: `run.mjs --repo <PR worktree>` reads `cli` from the PR and `ev.sh` runs it with node, so a PR could run its code on the reviewing machine. The steward now runs the passes from the trusted checkout. By hand, `run.mjs --repo` on someone else's worktree was guarded only by a README and skill warning; #324 (PR #326, merged) put the fence in the runner: it ignores the `cli` of a `--repo` it does not live in.
  - Squad $0.56 (15 steps, one red and recovered; every review round).
- **Squad: a cut-short answer fails the run** (#316, PR #318, merged): `finish_reason` present and not `stop` in `--oneshot` / `--batch` -> `truncated answer`, ledger `truncated-answer`.
- **dev-squad guards in every harness** (#315, PR #314 with #313 inside, merged). The first version's rules and hooks reached only Claude sessions, while coder, reviewer and auditor run on the OpenRouter loop. Now: the memory pack closes the OpenRouter system prompt; one format + lint (`src/format-and-lint.ts`, ESLint 9) in the hook and the loop; a `simplicity` score in the reviewer rubric; `osv_scan` from `src/tools/osv.ts` in both harnesses (axios 0.21.0: 0 of 25 wrong fixed versions, 22 before); children run without API keys; `dep-audit` removed (it could not see a new dependency in any harness). Squad $0.37.
- **Squad kit measured on its own runner** (#322, PR #325, merged). Reviewer and security answer in one request with the code packed by default (`now`, `relaxed`; `overnight` stays batch; `--loop` keeps the tool loop), and only with the JSON verdict: an answer without one fails the run (`no-verdict`), the loop asks once more, the steward retries it like an empty answer. Reviewer default `z-ai/glm-5.3-flash` (was FlashX: same 12/12, a quarter of the price). 540 benchmark runs ($1.22) scored with the gate's own code: in the old tool loop the cheap reviewers answered prose on clean diffs, so the gate could never say READY. The results page walks a fresh project from `squad init` to a kept and fixed security finding for $0.0121. The steward on #325 found two real bugs the lead's review missed (two prose `finish` calls in one reply used both asks; `costOf` summed amounts the model printed, live: $10.01 reported, $0.02 spent). Squad $0.14.
- **Also merged:** #278 (export: the raw-JSON check skips the appendix's printed file sources, #277), #312 (handoff of 2026-10-26).
- **Field numbers for the squad:** DeepSeek 4.1 Flash in `--oneshot`, 16 runs: 6 empty, 3 cut, 7 usable; the fallback now runs in the steward. The security pass varies on identical code (approve, then changes after a CHANGELOG-only merge): the brief lists what is already decided. Several findings were false (a zod default, a "missing" removal, ESLint absent, "the base moved"): verify each in the code or by running it. In task files the coder's test tool is `run test <file>`, not `run vitest`.
- **Open, security first:** #317 (the SDK worktree fence of `examples/dev-squad` lets `..` through; its children keep HOME): before anything runs unattended. #324 is fixed (PR #326). #320 (a squad runner: a headless lead works labelled issues, locally or on a server) waits for five decisions: where, how many in parallel, stop point, `claude -p` or Agent SDK, polling or webhook. #305 as before. The tutorial video of 2026-10-26 is still unpublished.

## Status on 2026-10-26

- **Tutorial Studio** (#308, PR #311, merged). `examples/tutorial-studio`: a narrated video tutorial of a web app as a tower and runnable scripts on Argo (brief, outline, narration and actions per scene, OpenRouter voice, headless Chrome on the GPU at 1080p, captions, chapters, contact sheet). The sample is Flow Tower's own tutorial: 17 scenes, 3:46, voice `google/gemini-3.8-flash-tts` (`Charon`), picked after a pilot with three other voices. The README covers running it, making one for another app, and how the sample was made.
  - Four review rounds; 13 findings fixed (key kept away from the recorded app and its children, clean-screen check before every scene, speech timeout, fail-closed forbidden list…), the rest dropped with reasons on #308. DeepSeek answered empty three times; the last security round ran on GLM.
  - `argo validate` finds scene marks by regex: `narration.mark('<scene>')` must stay literal in a demo script.
  - Squad $0.28.
- **Open:** the video is approved but not published. When the destination is chosen (release asset or video host), link it from `examples/tutorial-studio/README.md`.

## Status on 2026-10-24

- **v0.13.0 released** (2026-10-24, PR #296; [report](examples/release-auditor/reports/v0.13.0.md)). It holds hub security #286 and #287, the voice guided tour #275, the catalogue re-check #281, #279, #289, the onboarding docs and #291.
  - Gates and the full e2e on the GPU: 103/103.
  - Two fixes on the release branch: the `model-benchmark` tower linked a file outside `examples/`, which `validate` does not flag; and zod went to 4.6.7 for GHSA-mrhx-c7xc-m3w5, an advisory that appeared between gate runs.
- **Viewers load only the app** (#287, PR #294). In hub mode a listed viewer's request outside `/api` passes only for the app's own assets (`src/server/viewer-assets.ts`). Everything else of the checkout is 403, including `?raw` / `?url` reads, also when hidden behind a second `?`. `flow-tower.local.json` is in `fs.deny`.
  - The pre-merge review found the second-`?` bypass; it was fixed and probed live.
  - Left out, pre-existing: Vite's 500 page shows absolute host paths to a viewer.
  - Squad $0.042.
- **Tower card in the tower view** (#295, PR #297, merged). At Tower overview the right panel shows the tower's card (the library card's facts); it can be reduced, and the choice is remembered.
  - The fresh review found three defects, all fixed: no re-framing when the card toggles, not a keyboard panel, hidden under Issues.
  - A long tower name was cut with an ellipsis: it now wraps whole, the toggle on its first line (#301, PR #302, merged; e2e in `tower-info.spec.ts`).
- **Dev squad: efficiency rule, parallel review, merge gate** (#299, PR #300, merged). Every squad prompt shares `STYLE_RULES` (`tools/squad/config.mjs`), which asks for the efficient approach when it adds no complexity. Review and security start together. `tools/squad/gate.mjs` is a script, no model: READY only with CI green, a mergeable PR, a clean worktree at its head, and both passes approving that head commit with no critical or high finding. Findings quote their line, and the gate marks a quote it cannot find as unverified.
  - Six review rounds on the PR itself, each kept finding a squad step (06-14). Kept and dropped findings on #299.
  - A quote proves the line exists, not that the finding is right: the lead still checks each one (one round had a real quote and a wrong claim).
  - DeepSeek 4.1 Flash answered empty in `--oneshot` on two rounds out of six: the security brief then ran on GLM, as the README says.
  - Squad $0.20.
- **Merging:** `main` needs a CODEOWNERS review. The maintainer cannot approve their own PRs, so they merge with `gh pr merge <n> --merge --admin`, only after the review and the merge gate's READY, and only when they say so. Claude Code's auto mode refuses that command from Claude ("Merge Without Review"): the maintainer runs it with `!`.
- **Open follow-ups to decide:** `validate` does not flag node files outside the served folder (the release found one by e2e); Vite's 500 page to remote viewers; squad hardening #303; vitest `isolate: false` #304; a security check between releases (dependencies, semgrep, gitleaks, attack surface, a dependency check in CI) #305.

## Status on 2026-10-23

- **Tower first, then code, in the skills** (#291, PR #292): the `flow-tower-squad` lead updates the tower that models the change (validated 0/0, committed) before the first task file, and checks it still matches after verifying; the kit's `squad.tower.yaml` draws it. `flow-tower` and `docs/generate-a-tower.md` gain step 7, `flow-tower audit` (a finding fixed only when the code shows the missing fact, otherwise listed in the report), and offer `flow-tower-optimize` (offered, not mandatory: it has an intake and proposals to approve). A code change asked for after mapping starts from the tower, through the squad skill if the user runs the squad. `CLAUDE.md` Conventions carry the three rules; `AGENTS.md` lists verify and audit. A fresh pre-merge review found 4 should-fix and 3 nits, all fixed before merge (triage on #291). Docs only, squad cost $0.
- **Model sources:** the optimizer and the cost skill read OpenRouter (`models.mjs`, categories) and our own benchmark; Artificial Analysis stays a source quoted by hand in research issues (#281), never in the tools (its terms).

## Status on 2026-10-22

- **Not-sent message** (#289, PR #290): a viewer opening a shared tower's file its satellite did not send reads `this file was not sent by the satellite: share the tower with --files` (404).

- **Viewers read the files of shared towers** (#286, PR #285): a listed viewer opens the files a shared tower references; the hub's own towers and other projects stay unreadable remotely. The first version (from another session) exposed any file under a tower root and the first served folder: caught by the security review, fixed before merge. The command center runs `8c141a1` (pulled, restarted, checked live).
- **First teammate connected** to the command center: the hub machine shared on its own through Tailscale (not the whole tailnet), the teammate's login in `viewers`, `connect` minted the token. Steps now in docs/command-center.md § Connect to it.
- **Open from the review:** #287, Vite static serving answers a viewer some files of the flow-tower checkout.

## Status on 2026-10-21

- **Command center** at v0.12.0 plus the guided tour and #279 (`a108515`), pulled, restarted for the server changes, checked over the tailnet.
- **Library titles on a hub** (#279, PR #283): the chips sit under the title, so names keep whole words; checked live on the command center.
- **New models re-checked** (#281, PR #282): research pick `deepseek-v4.1-flash-1017`; the rest of the catalogue stands. Artificial Analysis data is not integrated: its terms need AA's written consent.
- **Voice guided tour** (#275, PR #280): "panoramica guidata" / "guided tour" walks the tower layer by layer, each node lit as its sentence plays; next, previous, details, stop; narration in the phrase's language from the tower's own text, cached per tour, one retry then the tower's text. Checked live on game-studio (14 layers, about $0.001 per layer). The voice-commands tower maps it.
- **v0.12.0 released** (2026-10-21): the audit that reads stated facts (#249), the example towers optimized and on the models the per-node benchmark picked (#231, #274), the role catalogue (#261), the dev squad kit (#265), SQLite in the viewer (#264), share and unshare from the interface (#266), the ai-commercialista example (#228). Gates and the full e2e with the GPU (96/96, 29.6 min): [report](examples/release-auditor/reports/v0.12.0.md). gitleaks flagged the fake key of `tests/squad-key.test.ts`: kept in `.gitleaksignore` by its fingerprint.
- **The squad kit runs on a real project:** set up there with `squad init`, and issues worked end to end with the squad.

## Status on 2026-10-20

- **Models per node applied** (PR #274): the 30 switch rows of `examples/model-benchmark/results/2026-10-16-tower-nodes.md` in 18 example towers, with agent files, code, README and sample logs kept in step. co-scientist moves all its agents (8, plus the tournament sub-tower's ranking) off `gemini-2.0-flash` (no longer served); airline-support's triage and both guardrails run on `gpt-6-luna`, after a new guard task `airline-jailbreak` (gpt-6-luna, gpt-5.2, glm-5.3-flash all 5/5, $0.005). Audit unchanged (33 findings before and after). No model of the towers' families came out after 2026-10-16, so no re-run.
  - Nodes with their own evals confirm the switch on them before production: ai-video-studio `qa.frame_qa`, browser-worker `verify.verifier`, airline-support guardrails.
  - Still not benchmarked (11 nodes kept): research, analysis, computer use, Figma edits, translation; a task set per role is the next step for them.

## Status on 2026-10-19

- **Audit reads stated facts** (#249, PR #271, merged 2026-10-19; closes #231): `flow-tower audit` reads `effect` (`read` / `reversible` / `irreversible`), `model_varies`, edge conditions, `status`, and what a sub-tower inherits from the towers that open it (run budget and limits, a human gate). AUD03 walks upstream for the gate (a guard is info), AUD02 warns only past a width of 20, AUD11 grades isolation. Example towers state the facts where true: 114 findings before, 33 after, each remaining one explained on #249. On the way: `pack.mjs --paths` (review diffs for `examples/` and `docs/`), secret-looking files and C-quoted or renamed names kept out of the packed diff, and `audit --json` no longer cut at 64 KB in a pipe (it broke the optimizer's `snapshot.mjs`). Squad cost $0.13.
  - Known audit gaps (on #249): AUD03 accepts a gate on any upstream path, not on every path; in a gated sub-tower every entry counts as gated; `pack.mjs` filters secrets by name only.
- **Squad lessons:**
  - after changing an audit rule, re-run `audit examples` and diff against the "before": the width rule silenced 15 findings and wrongly added 3, caught only by the diff;
  - a rule that tightens a precondition (AUD04 now needs a model in the tower) turns old tests red when their fixture lacks it: say so in the task, or plan a fix-up step;
  - write the audit JSON to a file, not through a pipe, when an older CLI is in use.

## Status on 2026-10-18

- **Dev squad kit** (#265, PR #267, merged 2026-10-18): the squad runs on any git project. `flow-tower squad init <project>` copies the runner into `tools/squad/` with a detected `squad.json` (check command, writable and review folders, base branch, models), a task template and a ready squad tower; `flow-tower squad key` stores the OpenRouter key in the user folder; the `flow-tower-squad` skill is the lead's procedure, shipped by `install-skill`. Review and security found that the project's check and test commands saw `OPENROUTER_API_KEY` (fixed: dropped from every child). Checked end to end on a scratch project with a real key. Squad cost $0.21.
- **Viewer: SQLite databases and SQL schemas as tables** (#264, PR #269, merged 2026-10-18): a database (by its header) opens read-only with `node:sqlite` as a table list and the first 100 rows; a `.sql` file lists each table's columns. Bounded for big files. chief-of-staff ships a sample `ambient.sqlite3` (fictitious cards). Checked in Chrome at desktop and phone width. Squad cost $0.11.
- **Share and unshare from the interface** (#266, PR #270, merged 2026-10-18): a Share with hub menu on each local library card of a satellite, the Settings › Sharing list with Unshare (and Remove from config only when the hub is down), and the hint for an active project the hub does not light (#206). Behind it `/api/sharing/towers` (loopback only) and `share-actions.ts`, which the CLI calls too. The team-hub tower maps it. Checked on a scratch hub and satellite. Squad cost $0.14.
- **Benchmark roles** (PR #260, #231): merged with main (main's #262 already had image input; this branch's writer, planner, summarizer and vision task sets run on it), image test adapted. Its results are now `results/2026-10-16-tower-nodes.md` (the pick per node within a harness's family), apart from #262's cross-family role catalogue, and both say where they differ (vision). Merged 2026-10-18; it closes the benchmark part of #231.
- **Pre-merge review (2026-10-18):** a fresh read-only review of each PR before merge found real defects the step reviews had missed (a recursive SQLite view hanging the server, `-wal` files written beside a read-only database, a share from the card able to overwrite another folder's share, nothing telling a kit user to commit `tools/squad/`); all fixed before merge, triage on each issue.
- **Working rules set by the maintainer (2026-10-18):** towers first, then code (the tower that maps the change is step 0 of every plan); every PR gets a review before merge; an admin merge (`--admin`) only on the maintainer's explicit OK, after that review.
- **Squad lessons:**
  - a task that changes a text an existing test asserts must let the step update that assertion (step 09 of #265 went red on it);
  - tests that limit `PATH` must keep the running Node's folder: on GitHub Actions node is not in /usr/bin;
  - under load (a browser, two servers) the full check can fail on 5 s timeouts of unrelated tests: rerun the touched and timed-out files on their own before calling a step red, and commit it by hand once verified.
  - a step commits the tracked changes it finds, but not new files outside its `Files:` list: after a fix-up step, check `git status` for files the previous step created;
  - a task that lists a file "only if needed" turns the step red on the `Files:` check when the file needed no change: list only files the step must touch;
  - stop scratch servers and browsers as soon as a check is done: they slow the laptop and cause the timeouts above. A headless Playwright script that measures and closes is lighter than an open browser.

## Status on 2026-10-16

- **New example `ai-commercialista`** (#228, PR #255): an AI accountant for Italian companies that cites every source.
  - A professional signs every memo.
  - The research notes are in `examples/ai-commercialista/research/`. A verified list of 294 Italian sites was used as input and is not shipped (it is published as a private artifact, "Siti del commercialista").
  - Optimized with the tower optimizer (#231, PR #258): the question is pseudonymized before triage, the fan-out is started by code, and the audit shows 0 warnings and 0 info.
- **Its own benchmark** (`examples/ai-commercialista/benchmark/`, 4 roles × 2 tasks) picked the models.
  - **Rule set by the maintainer:** same result, then the cheapest per correct answer and/or the fastest, any provider.
  - **Support check:** Opus → GPT-6 Luna. This adds OpenAI as a data processor: a DPA and the data region are to be confirmed before production.
  - **Researcher:** Sonnet → Haiku 5.5.
  - **Open:** the scanner and drafter have no task set yet. Results are in the [cost skill reference § Benchmark 2026-10-16](skills/flow-tower-costs/reference.md).
- **Role catalogue** (#261, PR #262): `skills/flow-tower-costs/catalogue.md` gives a measured pick and two alternatives from other families for every node role, from 968 runs over 17 task sets (2026-10-16). `models.mjs --role <id> --families 2` prints the pick, then the live shortlist. The benchmark now calls every OpenRouter endpoint (decisions, embeddings, rerank, images, videos, speech, transcriptions). On the way, a key leak was fixed: `judge.mjs` let model-written code see `OPENROUTER_API_KEY`. Next for it: harder sets where every model passes (guard, data, intent, images), a `realtime-voice` set, rubric scores for review and writing, and a re-run when new models land (`--since 2026-10-16`).
- **Tool fixes found on the way:**
  - #229 / PR #230: `check-example` no longer flags `ft_` inside words or `/home/` inside URLs.
  - #256 / PR #257: `judge.mjs` command checks run on Node 24 (`--permission`).
  - Note for CI: `check-example` flags any word equal to the CI user name `runner` in an example's text.
- **Squad cost:** #228 $1.24, #229 $0.012, #256 $0.004, ai-commercialista under #231 $0.034. The benchmark run cost $0.44.

## Status on 2026-10-15

- **v0.11.0 released** (2026-10-15): the #181 laptop checks (GPU for 3D, `service` on real systemd), #211 closed, the remote-voice choice, the tooltip and panel-corner fixes, the description-length guideline, the example towers matched to the code. Gates and the full e2e with the GPU (94/94): [report](examples/release-auditor/reports/v0.11.0.md).
- **v0.10.0 released** (2026-10-13), the team-UX release. Gates and e2e: [report](examples/release-auditor/reports/v0.10.0.md).
  - Hub admin and alerts: #93 the Admin tab, #94 alert rules, #191 the alert webhook and the `errors` rule;
  - from a newcomer dry run (an agent followed the docs literally: a hub and two teammates on one host): #187 history counts hook errors, #188 the relay recovers by itself, #189 `hooks install` for every harness, #190 validated shared towers, #196 / #5 harness parity and Pi live, #192 Hub › Now, #193 CLI hints and Caddy without Tailscale, #194 `service install`, PR #205 the example towers and a docs-vs-code cross-check;
  - a second dry run found no broken journey; its high and medium findings are #206 (admin PAUSE, sender scoping on the hub, one `main` agent name, Now session states).
  - Goal set by the maintainer: **every journey fluid, few steps each**, and **the harness must not matter** (Claude Code, Codex, Pi, Hermes, the Agent SDK or scripts light towers the same way).
- **#181 laptop checks on Fedora (2026-10-13, Intel Iris Xe):** the full e2e is green, **89/89 in 16.9 min** with `FLOW_TOWER_E2E_GPU=1 npm run e2e -- --workers=2` (e2e.log in #217). On the way: #207 the 3D figures of the document never drew in Google Chrome (Chrome throttles an unseen iframe; it now stays on screen under a veil), #214 the GPU for export, report and e2e (closes #209; export 72 s → 16 s), #215 four `service` defects on a real `systemctl --user`, #216 a flaky axe test. 3D PDFs, the report-studio outline and the new example towers checked. **Still open in #181:** the real tailnet with the v0.10.0 team journeys and the macOS side of #194 (need the Mac); Caddy with a certificate and real ntfy / Slack / Telegram.
- **On hold by the maintainer:** [#208](https://github.com/JamesMoriartyDecripto/flow-tower/issues/208) troika fetches glyphs (`→ ≥ ✕ ·`) from jsdelivr at runtime, so offline the label specs fail; diagnosis and options are on the issue, to pick up only when an offline use hits it.
- **e2e anywhere:** headless Chrome renders WebGL in software even with a GPU; on a machine with one use `FLOW_TOWER_E2E_GPU=1`. On the test server (no GPU): 73/89 on a scratch port, the large towers time out in software.
- **#211 closed (2026-10-15):** the 12 low findings of the second dry run, in #219 (library card titles wrap) and #221; with #220 (explicit timeouts for CLI-spawning tests, which timed out under load on the laptop), #222 (a remote hub view hides the MIC and says why) and #223 (the HUD tooltip measures itself and stays inside the window). Under software WebGL the post-processing drew a dark rectangle: without a GPU the app now starts in eco (not saved as a preference). Targeted e2e 38/38 with the GPU; the full e2e ran green for v0.11.0 (`--workers=1`: two workers ran the 7.4 GB laptop out of memory).
- **Voice on the command center (maintainer's choice, 2026-10-15):** a hub keeps refusing voice to remote viewers (it runs on and bills the hub's machine); use voice in your own Flow Tower with the tower open locally. Researched alternatives (voice through the viewer's local server: Chrome 142+ / Firefox 151+ local network permission; the hub's key for viewers: OWASP LLM10 limits) are in #222.
- **Command center:** at v0.11.0 since 2026-10-15 (pulled and restarted, checked over the tailnet); its installed unit has the drop-in `/etc/systemd/system/flow-tower.service.d/stop.conf` with `SuccessExitStatus=130 143`. A pull needs `systemctl restart flow-tower` only when `src/server/` or `src/core/` changed. The checkout belongs to the service user: the maintainer pulls as that user.
- **Squad lesson:** coders rewrite an existing test file and drop earlier tests. Task files now say "never rewrite or empty an existing test file"; give each step its own test file.
- **Squad notes from #181:** OpenRouter can answer 504 or 429 in the middle of a coder step: discard the partial changes and rerun the step. A task that rewords an existing message breaks the test that asserts it: quote the existing text in the task. Worktrees with a symlinked `node_modules` make Vite answer 403 for fonts outside the root, so run e2e checks from the main checkout (detached HEAD) on a scratch port, never against the maintainer's server on 5317.
- **Squad cost of v0.10.0:** $1.53 (#93 $0.09, #94 $0.13, #187 $0.04, #188 $0.15, #189 $0.21, #190 $0.13, #191 $0.18, #196 $0.10, #192 $0.15, #193 $0.14, #194 $0.08, #206 $0.12), each posted on its issue.
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 Flash reviews, DeepSeek 4.1 Flash audits (it often returns an empty security answer on large packs: GLM with the security brief works, and the steward falls back to it). Measured on the squad's own runner: [results 2026-10-27](examples/model-benchmark/results/2026-10-27-squad-roles.md), [tools/squad](tools/squad/README.md).
- **Live:** the #97 two-computer test passed: the [command-center](examples/command-center) kit as a systemd service of a dedicated user, Tailscale Serve, two satellites on two computers lighting their towers together.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1–3 shipped; 4–8 on hold until the maintainer asks.

## Next, in order

0. #317 the dev-squad SDK worktree fence and its children's HOME: before anything runs unattended (#320)
1. #181 what needs the Mac: a real tailnet with the v0.10.0 team journeys, the macOS side of #194 (launchd)
2. #69 tower names as an STT prompt
3. docs-qa gaps left after #143: Q8 (hub flag), Q22 (Tailscale ACL for CI), Q31 (voice filter phrase)
4. Report studio, next types: architecture docs (arc42, C4) and research reports (IMRaD), sources already checked in docs/reports.md
5. #147 Blender and Unreal benchmark categories
6. #85 privacy profiles (unblocks the profile wizard of the Admin tab) · #95 the rest of remote activity · #86 fan-out
7. #97 the docker compose and Caddy variants (systemd and Tailscale tested)
8. ai-commercialista: benchmark task sets for the scanner and the drafter (both still on Sonnet), and harder cited-answer tasks (longer sources) before trusting Haiku on real research
9. On hold: #129 voice 2 items 4–8, until the maintainer asks

## How work is done

The dev squad (`tools/squad`, PR #115): the lead (Claude) writes a task file per step and verifies, including rendered output (screenshots, `pdftoppm` pages) for UI and print work; the Claude Haiku coder writes the code, GLM reviews, DeepSeek checks security; the maintainer merges. Every commit is signed off (DCO), and each issue's squad cost (`tools/squad/cost.mjs`) is posted on it when it closes.

**Pace** (#169, #322): reviews and security passes answer in one request with the code packed by `tools/squad/pack.mjs` by default (seconds, a fraction of a cent), and only with the JSON verdict the merge gate reads; `--loop` gives them tools when they must read more. `overnight` sends them through the Batch API (about half price, but it can wait for hours): only for unattended work. Faster models where the README table allows (`gpt-6-luna` for simple coding and non-sensitive security passes). The coder always runs the loop. [tools/squad § Pace](tools/squad/README.md#pace-how-fast-versus-how-cheap).

## Setup on a new machine

The history was rewritten before going public (2026-10-09): **re-clone**, do not pull into an older clone.

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower
npm install                        # Node >= 22.13 (node:sqlite for history)
npm run check                      # typecheck + tests
npm run dev                        # library of the examples at http://127.0.0.1:5317
npm run simulate -- dev-squad      # in a 2nd terminal: fake live events, sanity check
```

## Releasing

Bump `package.json` / `package-lock.json`, move `[Unreleased]` to a dated section in `CHANGELOG.md`, run `examples/release-auditor/scripts/gates.sh` (needs `uvx` and `gitleaks` on PATH; on the test server both are in `~/.local/bin`, and run it with `FLOW_TOWER_HOME` set to an empty scratch folder: its live events go to the server the user folder records) and a plain `npm run e2e` (not on the test server: its 5317 is the live hub), write `reports/vX.Y.Z.md`, merge through a PR, then tag and publish the GitHub release with the CHANGELOG section as notes.
