# Doc gaps

Latest run: 2026-10-11T10:31Z, model `google/gemini-3.5-flash-lite`, 3 runs per question (majority pass), docs loaded whole up to 16000 B.

**Score: 22/24** judged by `deepseek/deepseek-v4.1-flash` (route, citation guard and judge, majority pass). Tokens 437267, cost $0.1780.

## Gaps

### Q2. I copied only the YAML of rag-bot and validate warns about missing files. What do I do?
- expected: docs/getting-started.md
- routed: docs/getting-started.md
- pass rate: 1/3
- loaded: docs/getting-started.md (whole), 5375 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: set root to the directory containing the referenced files
- judge: fail, missing set root to the directory containing the referenced files
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

### Q8. How do I run a command center on a VPS for several machines?
- expected: docs/command-center.md, examples/command-center/README.md
- routed: docs/command-center.md
- pass rate: 0/3
- loaded: docs/command-center.md (whole), examples/command-center/README.md (whole), 13200 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: exact hub mode flag (--hub or "hub": true); hub address 127.0.0.1:5317
- judge: fail, missing exact hub mode flag (--hub or "hub": true); hub address 127.0.0.1:5317
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

## All questions

| Q | Result | Pass rate | Routed to | Loaded |
|---|---|---|---|---|
| Q1 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 5375 B |
| Q2 | FAIL | 1/3 | docs/getting-started.md | docs/getting-started.md (whole), 5375 B |
| Q3 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 5375 B |
| Q4 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 5375 B |
| Q5 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 5375 B |
| Q6 | pass | 2/3 | docs/realtime.md | docs/realtime.md (whole), 14703 B |
| Q7 | pass | 3/3 | docs/getting-started.md | docs/getting-started.md (whole), 5375 B |
| Q8 | FAIL | 0/3 | docs/command-center.md | docs/command-center.md (whole), examples/command-center/README.md (whole), 13200 B |
| Q9 | pass | 2/3 | docs/command-center.md | docs/command-center.md (whole), 9393 B |
| Q10 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12844 B |
| Q11 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12844 B |
| Q12 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12844 B |
| Q13 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12844 B |
| Q14 | pass | 2/3 | examples/command-center/README.md | docs/hub-reference.md (whole), 12844 B |
| Q15 | pass | 2/3 | docs/command-center.md | docs/command-center.md (whole), 9393 B |
| Q16 | pass | 3/3 | docs/command-center.md | docs/command-center.md (whole), 9393 B |
| Q17 | pass | 3/3 | docs/voice.md | docs/voice.md (whole), 9250 B |
| Q18 | pass | 3/3 | docs/voice.md | docs/voice.md (whole), 9250 B |
| Q19 | pass | 3/3 | skills/flow-tower-costs/SKILL.md | skills/flow-tower-costs/SKILL.md (whole), 2613 B |
| Q20 | pass | 3/3 | examples/dev-squad/README.md | examples/dev-squad/README.md (whole), 4694 B |
| Q21 | pass | 3/3 | NEXT.md | NEXT.md (whole), 2091 B |
| Q22 | pass | 2/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12844 B |
| Q23 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12844 B |
| Q24 | pass | 3/3 | docs/architecture.md | docs/architecture.md (sections), 13383 B |
