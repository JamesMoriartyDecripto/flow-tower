# Doc gaps

Latest run: 2026-10-11T10:24Z, model `google/gemini-3.5-flash-lite`, 3 runs per question (majority pass), docs loaded whole up to 16000 B.

**Score: 20/24** judged by `deepseek/deepseek-v4.1-flash` (route, citation guard and judge, majority pass). Tokens 465638, cost $0.1857.

## Gaps

### Q2. I copied only the YAML of rag-bot and validate warns about missing files. What do I do?
- expected: docs/getting-started.md
- routed: docs/getting-started.md
- pass rate: 1/3
- loaded: docs/getting-started.md (whole), 5375 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: set root: to the directory containing the files (or otherwise fix the root path) | wrong: `docs/getting-started.md#1-copy-one-tower-and-use-it` is not a valid file path to point `files` at
- judge: fail, missing set root: to the directory containing the files (or otherwise fix the root path), wrong `docs/getting-started.md#1-copy-one-tower-and-use-it` is not a valid file path to point `files` at
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

### Q12. How do I connect my laptop to the hub with flow-tower connect?
- expected: docs/command-center.md, docs/hub-reference.md
- routed: docs/hub-reference.md
- pass rate: 0/3
- loaded: docs/hub-reference.md (whole), 12726 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: heartbeat
- judge: fail, missing heartbeat
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

### Q21. What is the release process for a new Flow Tower version?
- expected: NEXT.md
- routed: docs/getting-started.md
- pass rate: 1/3
- loaded: NEXT.md (whole), 2091 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: CHANGELOG; gates.sh; npm run e2e | wrong: Not in the docs, closest doc is docs/getting-started.md
- wrong route: docs/getting-started.md
- judge: fail, missing CHANGELOG; gates.sh; npm run e2e, wrong Not in the docs, closest doc is docs/getting-started.md
- fix: make the expected doc's first lines or its CLAUDE.md row name this topic, or add the missing step under one heading.

### Q23. What does /api/sharing say when the hub is down for a while?
- expected: docs/hub-reference.md, docs/command-center.md
- routed: docs/hub-reference.md
- pass rate: 1/3
- loaded: docs/hub-reference.md (whole), 12726 B
- judge (deepseek/deepseek-v4.1-flash): fail | missing: 5000
- judge: fail, missing 5000
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
| Q8 | pass | 2/3 | docs/command-center.md, examples/command-center/README.md | docs/command-center.md (whole), examples/command-center/README.md (whole), 13245 B |
| Q9 | pass | 3/3 | docs/command-center.md | docs/command-center.md (whole), 9438 B |
| Q10 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q11 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q12 | FAIL | 0/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q13 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q14 | pass | 3/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q15 | pass | 2/3 | docs/realtime.md | docs/hub-reference.md (whole), docs/command-center.md (whole), 22164 B |
| Q16 | pass | 3/3 | docs/command-center.md | docs/command-center.md (whole), 9438 B |
| Q17 | pass | 3/3 | docs/voice.md | docs/voice.md (whole), 9250 B |
| Q18 | pass | 3/3 | docs/voice.md | docs/voice.md (whole), 9250 B |
| Q19 | pass | 2/3 | skills/flow-tower-costs/SKILL.md | skills/flow-tower-costs/SKILL.md (whole), 2613 B |
| Q20 | pass | 3/3 | examples/dev-squad/README.md | examples/dev-squad/README.md (whole), 4694 B |
| Q21 | FAIL | 1/3 | docs/getting-started.md | NEXT.md (whole), 2091 B |
| Q22 | pass | 2/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q23 | FAIL | 1/3 | docs/hub-reference.md | docs/hub-reference.md (whole), 12726 B |
| Q24 | pass | 3/3 | docs/architecture.md | docs/architecture.md (sections), 13383 B |
