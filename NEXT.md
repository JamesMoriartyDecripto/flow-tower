# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-13

- **v0.10.0 released** (2026-10-13), the team-UX release. Gates and e2e: [report](examples/release-auditor/reports/v0.10.0.md).
  - Hub admin and alerts: #93 the Admin tab, #94 alert rules, #191 the alert webhook and the `errors` rule;
  - from a newcomer dry run (an agent followed the docs literally: a hub and two teammates on one host): #187 history counts hook errors, #188 the relay recovers by itself, #189 `hooks install` for every harness, #190 validated shared towers, #196 / #5 harness parity and Pi live, #192 Hub › Now, #193 CLI hints and Caddy without Tailscale, #194 `service install`, PR #205 the example towers and a docs-vs-code cross-check;
  - a second dry run found no broken journey; its high and medium findings are #206 (admin PAUSE, sender scoping on the hub, one `main` agent name, Now session states).
  - Goal set by the maintainer: **every journey fluid, few steps each**, and **the harness must not matter** (Claude Code, Codex, Pi, Hermes, the Agent SDK or scripts light towers the same way).
- **e2e on the test server:** 73/89 on a scratch port; the 16 failures are large towers timing out in software WebGL, the same on the v0.9.0 tag that day. **Not checked here** (no GPU, the live hub on 5317): the plain `npm run e2e` and its e2e.log, 3D PDFs, a real tailnet, macOS launchd and a real `systemctl --user` for `service install`, Caddy with a certificate, real ntfy / Slack / Telegram. All in [#181](https://github.com/JamesMoriartyDecripto/flow-tower/issues/181), from the laptop.
- **Open from the second dry run:** [#211](https://github.com/JamesMoriartyDecripto/flow-tower/issues/211), 12 low findings (simulate target, truncated card titles, sub-cent budgets, test alert rule name, share named `tower`, …).
- **Live hub leftovers (2026-10-13):** one test event (`error`, "fallback test", host `sat188b`) sits in the live hub's history; the hub runs as user `flowtower`, so removing it needs that user (the row and its hourly and daily rollups, with the service stopped). The maintainer agreed to clean it if not needed. A revoked test token `sat188b` is still listed in the lead's own `~/.config/flow-tower/tokens.json` (harmless; `token` has no remove command).
- **Squad lesson:** coders rewrite an existing test file and drop earlier tests. Task files now say "never rewrite or empty an existing test file"; give each step its own test file.
- **Squad cost of v0.10.0:** $1.53 (#93 $0.09, #94 $0.13, #187 $0.04, #188 $0.15, #189 $0.21, #190 $0.13, #191 $0.18, #196 $0.10, #192 $0.15, #193 $0.14, #194 $0.08, #206 $0.12), each posted on its issue.
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 FlashX reviews, DeepSeek 4.1 Flash audits (it often returns an empty security answer: GLM with the security brief works). See [tools/squad](tools/squad/README.md) and the cost skill reference § Benchmark 2026-10-11.
- **Live:** the #97 two-computer test passed: the [command-center](examples/command-center) kit as a systemd service of a dedicated user, Tailscale Serve, two satellites on two computers lighting their towers together.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1–3 shipped; 4–8 on hold until the maintainer asks.

## Next, in order

1. #181 laptop checks: full e2e (commit its e2e.log), 3D PDFs, a real tailnet with the v0.10.0 team journeys, the macOS side of #194
2. #211 low findings of the second dry run
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

Bump `package.json` / `package-lock.json`, move `[Unreleased]` to a dated section in `CHANGELOG.md`, run `examples/release-auditor/scripts/gates.sh` (needs `uvx` and `gitleaks` on PATH; on the test server both are in `~/.local/bin`, and run it with `FLOW_TOWER_HOME` set to an empty scratch folder: its live events go to the server the user folder records) and a plain `npm run e2e` (not on the test server: its 5317 is the live hub), write `reports/vX.Y.Z.md`, merge through a PR, then tag and publish the GitHub release with the CHANGELOG section as notes.
