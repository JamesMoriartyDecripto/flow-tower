# Next session: handoff

What is in flight and what comes next. Where code lives: [docs/architecture.md](docs/architecture.md); source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**.

## Status on 2026-10-11

- **Team-hub stack ready to merge bottom-up** (merge commits; retarget the next PR before deleting a base): #87 → #88 → #89 → #96 → #100 → #112 → #103 → #106 → #107 → #111 → `chore/stack-cleanup`. #102 and #109 sit on main independently; #113 is `tools/squad`.
- **Live:** a hub on the test server running the [command-center](examples/command-center) kit, and a laptop satellite relaying to it.

## Next, in order

1. #92 hub panel
2. #85 privacy profiles
3. #93 admin
4. #94 alerts
5. #95 remote activity
6. #86 fan-out
7. #97 systemd, compose, Caddy and Tailscale on the real server
8. #99 dev-server heap and port leak
9. #105 model benchmarks ([model-benchmark](examples/model-benchmark))
10. #69, #65, #5

## How work is done

The dev squad (`tools/squad`, issue #113): the lead writes a task file per step, the squad codes, reviews and verifies it, the lead merges.

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
