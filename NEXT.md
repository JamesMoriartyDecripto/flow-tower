# Next session: handoff

Status on 2026-10-09 (night): **v0.1.0 released** after the pre-release audit (PR #36, report in `examples/release-auditor/reports/v0.1.0.md`; E2E suite `npm run e2e`). Next: history secret scan done (gitleaks clean), make the repo public (maintainer's call), static demo on GitHub Pages (#15), then the update notice (#35).

Source of truth: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**. Where code lives: [docs/architecture.md](docs/architecture.md).

## Setup on a new machine

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower
npm install                        # Node >= 22.12
npm run check                      # typecheck + tests (all passing)
npm run dev                        # library of the examples at http://127.0.0.1:5317
npm run simulate -- dev-squad      # in a 2nd terminal: fake live events, sanity check
```

## Priority: real live integrations (issues #4–#7)

Keep `npm run dev` running and open the **LIVE** feed (`F`). Events that match no node are marked *unmapped*.

1. **Claude Code** (#4): merge `integrations/claude-code/settings.json` into a test project's `.claude/settings.json` (on a clone use `node <repo>/bin/flow-tower.js emit --source claude-code`). Run a session with subagents and tools; generate that project's tower with the skill to see events land on nodes.
2. **Pi** (#5): copy `integrations/pi/flow-tower.ts` to `~/.pi/agent/extensions/`; also try `pi --mode json "hello" | node bin/flow-tower.js emit --source pi`.
3. **Hermes** (#6): merge `integrations/hermes/config.yaml` into `~/.hermes/config.yaml`; inspect a raw payload with `curl -s 127.0.0.1:5317/api/events | tail -c 2000`.
4. **Skill** (#7): `node bin/flow-tower.js install-skill --target <claude|codex|pi|hermes>`, then ask each agent *"map this agent system into a flow tower"*.

For every mismatch, fix the adapter in `src/core/adapters.ts` and add a test with the real payload in `tests/events.test.ts`.

## Then

- #31: schema gaps found by the presets (years, per-item approvals, quotas, run-wide budgets, typed decisions…).
- #9: OTLP ingest for tokens and cost per node.
- #11 distribution (npx), #15 export, #13 diff mode, #14 swimlanes, #12 per-project themes, #17 polish.
