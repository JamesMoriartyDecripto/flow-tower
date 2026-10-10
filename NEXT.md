# Next session: handoff

Status on 2026-10-10: **v0.5.0 released** (gates and E2E in `examples/release-auditor/reports/v0.5.0.md`). Since v0.4.0:
- **Voice journal and self-improvement (#68):** opt-in; reviews propose aliases, rules and reply style, applied only when accepted. The key, journal and memory live in `~/.config/flow-tower` (or `FLOW_TOWER_HOME`), never in the repo.
- **Voice fixes:** no echo loop (half-duplex, #72), a spectral noise filter for laptop fans (#73), robustness (#74).
- **Faster first audio (#70):** a cached spoken acknowledgement brings first audio to about 0.6 s. The agent now runs on Gemini 3.5 Flash-Lite, the winner of a six-model benchmark.
- **Security:** the loader never reads secret files or the user folder, including through symlinked tower files.
- **Skill:** `flow-tower-costs` cuts model cost and latency of a tower, measured on real cases.
- **Examples:** the dev-squad models the mixed-model squad that built these releases. Coder and security run on DeepSeek 4.1 Flash, the reviewer on GLM 5.3 FlashX, lead and verifier on Claude, all at low effort.

Next:
- #69: vocabulary hints for transcription (tower names as an STT prompt);
- #75: dev-squad field findings (smaller coder tasks: the Flash coder hit its 60-step cap twice);
- #65: PDF export;
- #59: team hub;
- #5: Pi live test, on the other machine.

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
