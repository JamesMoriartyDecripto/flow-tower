# Session log

Append-only run journal. The pipeline appends one entry per issue; the Stop hook
appends one per agent session. The SessionStart hook injects the last 5 issue
entries into new sessions. Rotate monthly into `memory/archive/`.

## 2026-10-02T09:14:52.118Z — #301 pr_open
- rounds: 1 · cost: $2.84
- lesson: e2e selectors by role survived the header redesign; promoted to patterns.md

## 2026-10-03T16:40:07.551Z — #305 escalated
- rounds: 3 · cost: $9.12
- lesson: reviewer and coder disagreed on pagination contract; plan lacked an API criterion. Architect now derives criteria for public API changes

## 2026-10-05T11:02:33.904Z — #309 needs_info
- rounds: 0 · cost: $0.01
- lesson: bug report had no reproduction steps; triage asked for browser and account type

## 2026-10-07T14:27:18.260Z — #312 pr_open
- rounds: 2 · cost: $4.37
- lesson: security auditor caught path traversal in export filename; fixed with basename + allowlist

## 2026-10-08T10:05:41.772Z — #316 pr_open
- rounds: 1 · cost: $0.62
- lesson: quickfix route, typo in onboarding email template; no surprises
