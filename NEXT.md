# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-11

- **v0.6.0 released:** the team-hub stack, its towers and guides, the skills, model-benchmark and `tools/squad` are on main. Gates and e2e: [report](examples/release-auditor/reports/v0.6.0.md).
- **Live:** a hub on the test server running the [command-center](examples/command-center) kit, and a laptop satellite relaying to it.
- **Found at release:** #118 (`validate` misses folder references; CI does not run e2e), #119 (KaTeX override, Dependabot low).

## Next, in order

1. #92 hub panel (in review, this PR)
2. #121 the user's own library (skill + CLI)
3. #85 privacy profiles
4. #93 admin
5. #94 alerts
6. #95 remote activity
7. #86 fan-out
8. #97 systemd, compose, Caddy and Tailscale on the real server
9. #99 dev-server heap and port leak
10. #105 model benchmarks ([model-benchmark](examples/model-benchmark))
11. #69, #65, #5

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
