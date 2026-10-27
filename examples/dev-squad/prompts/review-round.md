Review round {{round}} of {{max_rounds}} for issue #{{issue_number}} on branch
`{{branch}}` in `{{worktree}}`.

## Approved plan
{{plan}}

## Findings from the previous round (verify each one is resolved)
{{previous_findings}}

Check hot paths for latency: code that runs on every hook call or event. Flag any
work proportional to that path that need not be there (a CLI that spawned a second
runtime per call tripled the time, 0.14 s -> 0.41 s).

Grade the current diff (`git diff origin/main...HEAD`) with your rubric and
return ONLY the JSON verdict. {{round_note}}

## Simplicity checks (evidence-based)
Before scoring Design and Simplicity, verify each of the following against
empirical thresholds. A violation is BLOCKING if it harms understandability
or maintainability.
- **Cognitive Complexity**: any function >15? (Barón et al. 2020)
- **Size**: any function <10 LOC (micro-fragment risk) or >40 LOC? (Malaiya & Denton 2000)
- **DRY**: any duplicate block (>6 similar lines) not justified by readability?
- **Language**: non-English identifiers, comments or error strings?
- **Comments**: do they explain WHY (not WHAT)? Are they ≤2 lines and consistent with code? (Rani et al. 2023)
- **YAGNI**: speculative abstractions or generic helpers without callers in this issue?
