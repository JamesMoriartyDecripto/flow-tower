# Next session: handoff

Status on 2026-10-10: **v0.2.0 released** (gates and E2E 44 / 44 in `examples/release-auditor/reports/v0.2.0.md`). Since v0.1.0: export packs (ZIP of every layer and map, project and sub-towers, SVG or Full HD PNG), OTLP tokens and cost per node, update notice, online demo on GitHub Pages, schema gaps (#31), Claude Code adapter verified with real hooks (#4, #44), file viewer wrap and formatted Markdown, the [what goes where](docs/what-goes-where.md) guide. Hermes verified live (#6).

Source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**. Where code lives: [docs/architecture.md](docs/architecture.md).

## Setup on a new machine

The history was rewritten before going public (2026-10-09): **re-clone**, do not pull into an older clone.

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower
npm install                        # Node >= 22.12
npm run check                      # typecheck + tests (all passing)
npm run dev                        # library of the examples at http://127.0.0.1:5317
npm run simulate -- dev-squad      # in a 2nd terminal: fake live events, sanity check
```

## Open

- **#5 Pi**: copy `integrations/pi/flow-tower.ts` to `~/.pi/agent/extensions/`; also try `pi --mode json "hello" | node bin/flow-tower.js emit --source pi`. For every mismatch, fix the adapter in `src/core/adapters.ts` and add a test with the real payload.
- **#7 Skill**: `node bin/flow-tower.js install-skill --target <claude|codex|pi|hermes>`, then ask each agent *"map this agent system into a flow tower"*; check the result against [what goes where](docs/what-goes-where.md).
- #11 distribution (npx), #13 diff mode, #14 swimlanes, #12 per-project themes (on hold), #17 polish.

## Releasing

Bump `package.json` / `package-lock.json`, move `[Unreleased]` to a dated section in `CHANGELOG.md`, run `examples/release-auditor/scripts/gates.sh` (needs `uvx` and `gitleaks` on PATH) and a plain `npm run e2e`, write `reports/vX.Y.Z.md`, merge through a PR, then tag and publish the GitHub release with the CHANGELOG section as notes.
