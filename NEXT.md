# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-13

- **v0.9.0 released** (2026-10-13): everything below shipped together. Gates and e2e: [report](examples/release-auditor/reports/v0.9.0.md).
  - #164 one-step `connect` on a tailnet and tower `share` / `unshare` / auto-sync; #165 library sources and the FROM filter; #166 command-center kit findings;
  - #65 tower documentation as PDF (`flow-tower export --pdf`); #174 report studio (`flow-tower report`, five types, `examples/report-studio`);
  - #173 tower optimizer (`flow-tower audit`, `docs/best-practices.md`, `examples/tower-optimizer`, skill `flow-tower-optimize`);
  - #169 squad pace; #176 bash `steps.sh` and the `Files:` check;
  - #122 contribution path and DCO, #156 squad cost per issue, #160 voice `live_status`, #99 memory leak, #95 part 1.
- **Not checked on the test server** (no GPU, the live hub on 5317): full `npm run e2e` with the release e2e.log, PDFs with 3D snapshots, the real tailnet test of #164/#165. All in [#181](https://github.com/JamesMoriartyDecripto/flow-tower/issues/181), to run from the laptop.
- **After v0.9.0:** merged #137 optional runtime files, #143 the architecture split, #94 hub alerts, #93 the hub Admin tab.
- **Team UX plan (2026-10-13).** A newcomer dry run (an agent followed the docs literally: a hub and two teammates on one host) found single-machine journeys smooth, team journeys rough. Goal set by the maintainer: **every journey fluid, few steps each**, and **the harness must not matter** (Claude Code, Codex, Pi, Hermes, the Agent SDK or scripts light towers the same way). Merged: #187 (PR #195), #188 (PR #197). **Open, stacked, all green; merge bottom-up, retargeting the next to `main` each time:** PR #198 (#189 `hooks install`) → #199 (#190 validated shares, sync state) → #200 (#191 alerts outside the tab) → #201 (#196 harness parity, #5 Pi live) → #202 (#192 Now view, signals) → #203 (#193 CLI hints, route without Tailscale) → #204 (#194 `service`, emit never guesses a port) → #205 (example towers, cross-check fixes). Post each issue's squad cost when it closes.
- **Example towers updated** (PR #205, on top of #204): `team-hub`, `command-center`, `dev-squad`; a cross-check agent then compared ~140 doc and tower claims with the code and the fixes are in the same PR. **Next:** re-run the newcomer dry run on the top of the stack and compare steps per journey with the first run.
- **Live hub incident (2026-10-13):** one test event (`error`, "fallback test", host `sat188b`) reached the live hub on 5317 before #194 fixed `emit`'s default port on a satellite. Left in place; the maintainer decides whether to clean it.
- **Squad lesson:** coders rewrite an existing test file and drop earlier tests. Task files now say "never rewrite or empty an existing test file"; give each step its own test file.
- **Squad cost on 2026-10-12:** #164 $0.33, #165 $0.06, #169 $0.11, #65 $0.89, #176 $0.02, #173 $0.11, #174 $0.15 (post each on its issue when it closes: `node tools/squad/cost.mjs <n>`).
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 FlashX reviews, DeepSeek 4.1 Flash audits. See [tools/squad](tools/squad/README.md) and the cost skill reference § Benchmark 2026-10-11.
- **Live:** the #97 two-computer test passed: the [command-center](examples/command-center) kit as a systemd service of a dedicated user, Tailscale Serve, two satellites on two computers lighting their towers together.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1–3 shipped; 4–8 on hold until the maintainer asks.

## Next, in order

1. The team UX plan above: merge the stack #198 → #204, then the example towers and the second dry run
2. #181 laptop checks: full e2e (commit its e2e.log), 3D PDFs, the real tailnet test of #164/#165, and the macOS side of #194
3. #69 tower names as an STT prompt
4. docs-qa gaps left after #143: Q8 (hub flag), Q22 (Tailscale ACL for CI), Q31 (voice filter phrase)
5. Report studio, next types: architecture docs (arc42, C4) and research reports (IMRaD), sources already checked in docs/reports.md
6. #147 Blender and Unreal benchmark categories
7. #85 privacy profiles (unblocks the profile wizard of the Admin tab) · #95 the rest of remote activity · #86 fan-out
8. #97 the docker compose and Caddy variants (systemd and Tailscale tested)
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

Bump `package.json` / `package-lock.json`, move `[Unreleased]` to a dated section in `CHANGELOG.md`, run `examples/release-auditor/scripts/gates.sh` (needs `uvx` and `gitleaks` on PATH; on the test server both are in `~/.local/bin`) and a plain `npm run e2e` (not on the test server: its 5317 is the live hub), write `reports/vX.Y.Z.md`, merge through a PR, then tag and publish the GitHub release with the CHANGELOG section as notes.
