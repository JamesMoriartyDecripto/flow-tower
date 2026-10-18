# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

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
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 FlashX reviews, DeepSeek 4.1 Flash audits (it often returns an empty security answer: GLM with the security brief works). See [tools/squad](tools/squad/README.md) and the cost skill reference § Benchmark 2026-10-11.
- **Live:** the #97 two-computer test passed: the [command-center](examples/command-center) kit as a systemd service of a dedicated user, Tailscale Serve, two satellites on two computers lighting their towers together.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1–3 shipped; 4–8 on hold until the maintainer asks.

## Next, in order

0. The squad kit acceptance test on a real project (`squad init`, `squad key`, `install-skill`, one issue end to end)
0b. #249 audit false positives, then close #231
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

**Pace** (#169): reviews and security passes run with `SQUAD_PACE=relaxed` (one direct request with the code packed by `tools/squad/pack.mjs`: about a cent, a few minutes). `overnight` sends them through the Batch API (about half price, but it can wait for hours): only for unattended work. When the maintainer is waiting: the default tool loop, no batch, and faster models where the README table allows (`gpt-6-luna` for simple coding and non-sensitive security passes). The coder always runs the loop. [tools/squad § Pace](tools/squad/README.md#pace-how-fast-versus-how-cheap).

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
