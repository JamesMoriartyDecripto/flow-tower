# Eval questions

Real questions users ask about Flow Tower. Each has the doc(s) that should answer it (any one counts
as a correct route) and 1-3 key facts, written by reading those docs. A fact passes when the answer
contains it (case-insensitive); `a / b` means either spelling counts. `eval.mjs` parses this file:
keep the `## Q`, `- docs:` and `- facts:` lines in this shape, facts separated by ` | `.

## Q1. How do I copy one of the example towers into my project and open it?
- docs: docs/getting-started.md
- facts: cp -R | validate | whole folder

## Q2. I copied only the YAML of rag-bot and validate warns about missing files. What do I do?
- docs: docs/getting-started.md
- facts: file not found | root:

## Q3. How do I write a tower from scratch?
- docs: docs/getting-started.md, docs/what-goes-where.md
- facts: init | validate

## Q4. How do I validate a tower file, for example in CI?
- docs: docs/getting-started.md, docs/schema.md
- facts: validate | --json

## Q5. Why should I run npm link, and what needs it?
- docs: docs/getting-started.md, docs/realtime.md
- facts: npm link | PATH | SessionStart

## Q6. How do I make nodes light up live from Claude Code hooks?
- docs: docs/realtime.md
- facts: integrations/claude-code/settings.json | http | 204

## Q7. How can I try a tower live without wiring any agent?
- docs: docs/getting-started.md
- facts: npm run simulate | --url

## Q8. How do I run a command center on a VPS for several machines?
- docs: docs/command-center.md, examples/command-center/README.md
- facts: --hub / "hub": true | 127.0.0.1:5317 | token add

## Q9. Should I put Tailscale or Caddy in front of the hub?
- docs: docs/command-center.md
- facts: tailscale serve | Caddy | 403

## Q10. Who can view the hub's UI?
- docs: docs/hub-reference.md, docs/command-center.md
- facts: viewers | tailnet | read-only

## Q11. Do I need one token per machine? How do I create one?
- docs: docs/command-center.md, docs/hub-reference.md
- facts: flow-tower token add | sha256 / prints it once

## Q12. How do I connect my laptop to the hub with flow-tower connect?
- docs: docs/command-center.md, docs/hub-reference.md
- facts: flow-tower connect | --token | heartbeat

## Q13. How do I pause sharing from my machine to the hub?
- docs: docs/hub-reference.md
- facts: pause | resume

## Q14. What does the hub never receive from a satellite?
- docs: docs/hub-reference.md
- facts: Prompts | tool output | file paths

## Q15. Events reach my hub but no node lights up. Why?
- docs: docs/command-center.md
- facts: library | towers/

## Q16. A setting in config.json is ignored. What is the config precedence?
- docs: docs/command-center.md
- facts: flags > environment > config file > defaults | empty | config show

## Q17. Where does Flow Tower keep my personal data, keys and tokens?
- docs: docs/voice.md, docs/getting-started.md
- facts: ~/.config/flow-tower | FLOW_TOWER_HOME

## Q18. How do I set up voice commands?
- docs: docs/voice.md
- facts: OPENROUTER_API_KEY | ~/.config/flow-tower/.env

## Q19. How do I cut the model cost of my agent system and pick cheaper models?
- docs: skills/flow-tower-costs/SKILL.md
- facts: models.mjs | real cases / benchmark | data_collection

## Q20. What is the dev-squad example and which models does it use?
- docs: examples/dev-squad/README.md
- facts: Claude Agent SDK | DeepSeek | GLM

## Q21. What is the release process for a new Flow Tower version?
- docs: NEXT.md
- facts: CHANGELOG | gates.sh | npm run e2e

## Q22. How do I send events from GitHub Actions to the hub?
- docs: docs/hub-reference.md
- facts: github-actions.yml | tag:ci / tailnet

## Q23. What does /api/sharing say when the hub is down for a while?
- docs: docs/hub-reference.md, docs/command-center.md
- facts: queued | 5000

## Q24. Which file owns the per-sender tokens in the code?
- docs: docs/architecture.md
- facts: src/server/tokens.ts
