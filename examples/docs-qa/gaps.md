# Doc gaps

Latest run: 2026-10-13T01:41Z, model `google/gemini-3.5-flash-lite`, 3 runs per question (majority pass), docs loaded whole up to 16000 B.

**Score: 28/31** judged by `deepseek/deepseek-v4.1-flash` (route, citation guard and judge, majority pass). Tokens 697365, cost $0.2647.

## Gaps

### Q8. How do I run a command center on a VPS for several machines?
- expected: docs/command-center.md, examples/command-center/README.md
- routed: docs/command-center.md, examples/command-center/README.md
- pass rate: 0/3
- loaded: docs/command-center.md (whole), 12774 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: --hub / "hub": true; 127.0.0.1:5317; token add
- judge: fail, missing --hub / "hub": true; 127.0.0.1:5317; token add
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

### Q22. How do I send events from GitHub Actions to the hub?
- expected: docs/hub-reference.md
- routed: docs/hub-reference.md
- pass rate: 1/3
- loaded: docs/hub-reference.md (whole), 14562 B
- judge (deepseek/deepseek-v4.1-flash): fail | wrong: ACL grants tag:flow-sender access, but the GitHub Actions runner is tagged tag:ci
- judge: fail, wrong ACL grants tag:flow-sender access, but the GitHub Actions runner is tagged tag:ci
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

### Q31. How do I show only the agent nodes by voice, and then everything again?
- expected: docs/voice.md
- routed: docs/voice.md
- pass rate: 1/3
- loaded: docs/voice.md (whole), 11958 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: correct command "mostra solo gli agenti" | wrong: states "mostra solo gli agents" instead of "mostra solo gli agenti"
- judge: fail, missing correct command "mostra solo gli agenti", wrong states "mostra solo gli agents" instead of "mostra solo gli agenti"
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

## All questions

| Q | Result | Pass rate | Routed to | Loaded |
|---|---|---|---|---|
| Q1 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q2 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q3 | pass | 2/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q4 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q5 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q6 | pass | 3/3 | docs/realtime.md | docs/realtime.md (whole), 14796 B |
| Q7 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q8 | FAIL | 0/3 | docs/command-center.md, examples/command-center/README.md | docs/command-center.md (whole), 12774 B |
| Q9 | pass | 2/3 | docs/command-center.md | docs/command-center.md (whole), 12774 B |
| Q10 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 14562 B |
| Q11 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 14562 B |
| Q12 | pass | 3/3 | docs/hub-reference.md, docs/command-center.md | docs/hub-reference.md (whole), docs/command-center.md (whole), 27336 B |
| Q13 | pass | 2/3 | docs/command-center.md | docs/command-center.md (whole), 12774 B |
| Q14 | pass | 3/3 | docs/hub-reference.md, examples/command-center/README.md | docs/hub-reference.md (whole), examples/command-center/README.md (whole), 21361 B |
| Q15 | pass | 3/3 | docs/command-center.md | docs/command-center.md (whole), 12774 B |
| Q16 | pass | 3/3 | docs/command-center.md | docs/command-center.md (whole), 12774 B |
| Q17 | pass | 3/3 | docs/voice.md | docs/voice.md (whole), 11958 B |
| Q18 | pass | 2/3 | docs/voice.md | docs/voice.md (whole), 11958 B |
| Q19 | pass | 3/3 | skills/flow-tower-costs/SKILL.md | skills/flow-tower-costs/SKILL.md (whole), 4111 B |
| Q20 | pass | 3/3 | examples/dev-squad/README.md | examples/dev-squad/README.md (whole), 5038 B |
| Q21 | pass | 3/3 | NEXT.md | NEXT.md (whole), 4838 B |
| Q22 | FAIL | 1/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 14562 B |
| Q23 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 14562 B |
| Q24 | pass | 3/3 | docs/architecture-server.md | docs/architecture-server.md (whole), 10016 B |
| Q25 | pass | 3/3 | skills/flow-tower-use-example/SKILL.md | skills/flow-tower-use-example/SKILL.md (whole), 1954 B |
| Q26 | pass | 3/3 | skills/flow-tower-contribute/SKILL.md | skills/flow-tower-contribute/SKILL.md (whole), 2499 B |
| Q27 | pass | 3/3 | docs/command-center.md | docs/command-center.md (whole), 12774 B |
| Q28 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 14562 B |
| Q29 | pass | 2/3 | docs/getting-started.md | docs/getting-started.md (whole), 6803 B |
| Q30 | pass | 3/3 | docs/voice.md | docs/voice.md (whole), 11958 B |
| Q31 | FAIL | 1/3 | docs/voice.md | docs/voice.md (whole), 11958 B |
