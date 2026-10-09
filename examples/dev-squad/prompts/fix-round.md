The review of branch `{{branch}}` requested changes (round {{round}} of {{max_rounds}}).
Fix ONLY the blocking findings below. Do not refactor anything else.

{{blocking_findings}}

For each finding: fix the root cause, add or adjust a test that would have caught
it, then run `run_tests` with `scope: "affected"`. Return your usual STATUS block
and map each finding id to the commit-ready change that resolves it.
