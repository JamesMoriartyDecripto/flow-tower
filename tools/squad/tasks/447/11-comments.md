# 447-11: comments that are true and say why

Rules: English only; edit only Files; delete a comment that restates the code; keep one that records a constraint of an outside system. Behaviour must not change. Verify: run typecheck, then test on tests/squad-roles.test.ts; finish with real checks and Known gaps. steps.sh runs the full check after finish: do not run it yourself.
Read the files below.

Why: review of #447 found false comments and comments that restate the code.

1. examples/model-benchmark/scripts/squad-roles.mjs, squad-loop.mjs, squad-score.mjs, squad-score.d.mts: delete file headers that narrate history or repeat the usage string, and every comment that says what the next line does. Fix or delete these false ones: "The rules are the gate's own" and "The gate blocks on everything except medium and low" (keep one true line: the rule is the gate's, case included); "Reading and writing the same file would lose lines halfway" (the guard stays: it keeps the paid raw results from being overwritten, say that); "then the cheapest run" (the sort is by total cost); "lines written before #447 step 1". Keep: "Run-major, models interleaved: a slow hour or a provider incident hits every model alike", and the finding format "path:line or path:line-line".
2. tools/squad/pack.mjs: delete the comment above the verdict rule line; the line gives its own reason.
3. tools/squad/roles.mjs lines 9-10: say that a read-only role with no model of its own falls back to the reviewer's, and that the defaults name every read-only role since #447.
4. tests/squad-roles.test.ts: delete the read-only graders test that builds `models: { reviewer: 'x/rev' }` (no config loaded by loadConfig can reach it) and the lines that pin researcher and verifier: tests/squad-config.test.ts already pins every default through loadConfig.

Files: examples/model-benchmark/scripts/squad-roles.mjs, examples/model-benchmark/scripts/squad-loop.mjs, examples/model-benchmark/scripts/squad-score.mjs, examples/model-benchmark/scripts/squad-score.d.mts (optional), tools/squad/pack.mjs, tools/squad/roles.mjs, tests/squad-roles.test.ts

Continuation: the first attempt is complete and correct. squad-score.d.mts had nothing left to change, because step 09 already removed the comment named here, so it is optional now. Change nothing; run the checks and finish.
