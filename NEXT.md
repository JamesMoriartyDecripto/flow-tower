# Next session: handoff

Status on 2026-10-09: MVP, layer lens, realtime and skill are merged into `main` (PRs #1, #2, #3, #18; semgrep clean). Live integrations still need to be tested against real Claude Code, Pi and Hermes, which are installed on the other machine.

Source of truth for the remaining work: **[GitHub issues](https://github.com/JamesMoriartyDecripto/flow-tower/issues)**. Start with the P1 ones.

## Setup on a new machine

```bash
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git
cd flow-tower
npm install                        # Node >= 22.12
npm run check                      # typecheck + tests (expect 39 passing)
npm run dev                        # library of the examples at http://127.0.0.1:5317
npm run simulate -- dev-squad      # in a 2nd terminal: fake live events, sanity check
```

## Test plan for the live integrations (issues #4, #5, #6)

Keep `npm run dev` running and open the **LIVE** feed in the top bar. Events that match no node are marked *unmapped*.

1. **Claude Code** (#4): merge `integrations/claude-code/settings.json` into the `.claude/settings.json` of a test project. The `SessionStart` command hook calls `npx flow-tower emit`; on a clone use `node <repo>/bin/flow-tower.js emit --source claude-code`. Run a session that uses subagents and some tools. To see the events land on nodes, generate a tower for that project with the skill (step 4).
2. **Pi** (#5): copy `integrations/pi/flow-tower.ts` to `~/.pi/agent/extensions/`, then run Pi. Also try `pi --mode json "hello" | node bin/flow-tower.js emit --source pi`.
3. **Hermes** (#6): merge `integrations/hermes/config.yaml` into `~/.hermes/config.yaml`. Inspect a raw payload with `curl -s 127.0.0.1:5317/api/events | tail -c 2000` and check where `child_role` and friends live: top level, or under `extra`.
4. **Skill** (#7): run `node bin/flow-tower.js install-skill`, then in Claude Code, inside each agent project, ask *"map this agent system into a flow tower"*. Open the result with `node bin/flow-tower.js <dir>`.

For every mismatch, fix the adapter in `src/core/adapters.ts` and add a test with the real payload in `tests/events.test.ts`. Paste the real payload into the issue.

## Then

- #9: OTLP ingest for tokens and cost.
- UX backlog: #10–#17.
