# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-11

- **v0.7.0 released:** the Hub panel (#92), your own library (#121), voice that closes files and resolves "its file" / "the next one" locally (#128, #130), Settings › Updates (#141), the #136 field notes, wide Markdown tables (#133), `validate` folder refs (#118), KaTeX (#119). Gates and e2e: [report](examples/release-auditor/reports/v0.7.0.md).
- **Live:** a hub on the test server running the [command-center](examples/command-center) kit, and a laptop satellite relaying to it.
- **Voice 2 plan:** [#129](https://github.com/JamesMoriartyDecripto/flow-tower/issues/129); item 1 (referents) shipped.

## Next, in order

1. #122 contribution path: open-source best practices (needs the maintainer's choices: DCO, code-of-conduct contact, Discussions)
2. #129 voice 2: the remaining tools, then `live_status`, clarifying questions, proactive alerts, browser VAD
3. #137 optional runtime files (schema)
4. #85 privacy profiles
5. #93 admin
6. #94 alerts
7. #95 remote activity
8. #86 fan-out
9. #126 split `bin/flow-tower.js`
10. #97 systemd, compose, Caddy and Tailscale on the real server
11. #99 dev-server heap and port leak
12. #105 model benchmarks ([model-benchmark](examples/model-benchmark))
13. #69, #65, #5

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
