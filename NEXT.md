# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-12

- **v0.8.0 released:**
  - voice: scroll, the Hub panel, filters, compare (#145);
  - command-center and satellite skills (#148);
  - the model benchmark's first full run, with live tower events (#105);
  - `--warm`, `--batch` and `cache_control` (#149);
  - the CLI split (#126).
  
  Gates and e2e: [report](examples/release-auditor/reports/v0.8.0.md).
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 FlashX reviews, DeepSeek 4.1 Flash audits. See [tools/squad](tools/squad/README.md) and the cost skill reference § Benchmark 2026-10-11.
- **Live:** a hub on the test server running the [command-center](examples/command-center) kit, and a laptop satellite relaying to it.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1 (referents) and 2 (tools) shipped.

## Next, in order

1. #129 voice 2: `live_status` ("cosa sta succedendo?"), clarifying questions, then proactive alerts, browser VAD, push-to-talk
2. #69 tower names as an STT prompt
3. #143 split `docs/architecture.md` (docs-qa Q24)
4. #122 contribution path: open-source best practices (needs the maintainer's choices: DCO, code-of-conduct contact, Discussions)
5. #137 optional runtime files (schema)
6. #147 Blender and Unreal benchmark categories; a live `--batch` and `--warm` run (#149)
7. #85 privacy profiles
8. #93 admin
9. #94 alerts
10. #95 remote activity
11. #86 fan-out
12. #97 systemd, compose, Caddy and Tailscale on the real server
13. #99 dev-server heap and port leak
14. #5 live events with Pi (P1, needs a machine with Pi)
15. #65

## How work is done

The dev squad (`tools/squad`, PR #115): the lead (Claude) writes a task file per step and verifies; the DeepSeek coder writes the code, GLM reviews, DeepSeek checks security; the maintainer merges.

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

Bump `package.json` / `package-lock.json`, move `[Unreleased]` to a dated section in `CHANGELOG.md`, run `examples/release-auditor/scripts/gates.sh` (needs `uvx` and `gitleaks` on PATH) and a plain `npm run e2e`, write `reports/vX.Y.Z.md`, merge through a PR, then tag and publish the GitHub release with the CHANGELOG section as notes.
