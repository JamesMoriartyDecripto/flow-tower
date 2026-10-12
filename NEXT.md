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
- **Since v0.8.0 (unreleased):**
  - #122: contribution path, community profile at 100%, every commit signed off (DCO), `dco` is a required check;
  - #156: squad cost per issue, `node tools/squad/cost.mjs <n>`, posted on each issue when it closes;
  - #160: voice `live_status`;
  - #99: dev-server memory leak fixed; the CLI loads its Vite config once and passes it inline (upstream Rolldown #10887 still open);
  - #95 part 1: live chips name the machine, library cards list recent machines.
- **Dev squad models** (from the benchmark and a field trial): Claude Haiku 5.5 codes, GLM 5.3 FlashX reviews, DeepSeek 4.1 Flash audits. See [tools/squad](tools/squad/README.md) and the cost skill reference § Benchmark 2026-10-11.
- **Live:** the #97 two-computer test passed: the [command-center](examples/command-center) kit as a systemd service of a dedicated user, Tailscale Serve, two satellites on two computers lighting their towers together.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129). Items 1–3 shipped; 4–8 on hold until the maintainer asks.

## Next, in order

1. #166 kit findings from the real deployment (and update the command-center tower)
2. #164 one-step connect and tower share/unshare/sync (confirm with the maintainer: YAML-only by default, files opt-in)
3. #165 library source badges and filter
4. #69 tower names as an STT prompt
5. #143 split `docs/architecture.md` (docs-qa Q24)
6. #137 optional runtime files (schema)
7. #147 Blender and Unreal benchmark categories; a live `--batch` and `--warm` run (#149)
8. #85 privacy profiles
9. #93 admin
10. #94 alerts
11. #95 the rest of remote activity (runtime rings, off-runtime mark, History tab, sparklines)
12. #86 fan-out
13. #97 the docker compose and Caddy variants (systemd and Tailscale tested)
14. #5 live events with Pi (P1, needs a machine with Pi)
15. #65
16. On hold: #129 voice 2 items 4–8 (clarifying questions, proactive alerts, browser VAD, push-to-talk), until the maintainer asks

## How work is done

The dev squad (`tools/squad`, PR #115): the lead (Claude) writes a task file per step and verifies; the Claude Haiku coder writes the code, GLM reviews, DeepSeek checks security; the maintainer merges. Every commit is signed off (DCO), and each issue's squad cost (`tools/squad/cost.mjs`) is posted on it when it closes.

**Pace** (#169): the maintainer is usually in no hurry, so reviews run with `SQUAD_PACE=relaxed` (one request through the Batch API, about half price; a model without a batch endpoint falls back to a oneshot), tasks built with `tools/squad/pack.mjs`. Use the default tool loop when the maintainer is waiting or a security pass needs to read the repo. The coder always runs the loop. [tools/squad § Pace](tools/squad/README.md#pace-how-fast-versus-how-cheap).

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
