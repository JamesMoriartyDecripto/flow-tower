# Next session: handoff

Status on 2026-10-10: **v0.4.0 released** (gates and E2E in `examples/release-auditor/reports/v0.4.0.md`). Since v0.3.0:
- **Voice:** commands (#62) and a conversational voice agent that answers out loud and acts on the tower (#63 part 1). Both run through OpenRouter, with the key kept on the local server.
- **Node list panel.**
- **Server hardening:** exact content type, cross-site refusal, and secret files never served.
- **Skill and docs:** a verify-against-the-code step, a services guide, clearer `validate` errors, deep links and `--browser` (#56, #7).
- **Examples:** `db-api-playbook` and `voice-commands`; dev-squad's sample code now matches its tower.

Done on `feat/voice-journal` (not merged yet): **#68**, the voice journal and self-improvement loop (#63 part 2). Opt-in in Settings > Voice > Learning; reviews propose aliases, rules and reply style, applied only when accepted. The key, journal and memory live in `~/.config/flow-tower` (or `FLOW_TOWER_HOME`), never in the repo.

Next:
- #69: vocabulary hints for transcription (tower names as an STT prompt);
- #70: faster first audio of agent replies;
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
