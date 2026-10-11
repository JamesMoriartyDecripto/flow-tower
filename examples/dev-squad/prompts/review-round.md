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
