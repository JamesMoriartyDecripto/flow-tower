The review of branch `{{branch}}` requested changes (round {{round}} of {{max_rounds}}).
Fix ONLY the blocking findings below. Do not refactor anything else.

{{blocking_findings}}

If your change turns one of your own or an existing test red because the behaviour
changed on purpose (e.g. a new request the test did not count), fix the test in the
same round and say why in the STATUS block. Do not stop.

For each finding: fix the root cause, add or adjust a test that would have caught
it, then run `run_tests` with `scope: "affected"`. Return your usual STATUS block
and map each finding id to the commit-ready change that resolves it.
