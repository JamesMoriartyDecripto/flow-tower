# 457-01: comments on this branch say why, and none is stale

Rules: English only; never touch secret files; edit only the files named below; change comments only, no code; files under ~400 lines.
Read tools/squad/gate.mjs lines 88-100, tools/squad/pack.mjs lines 176-182, tools/squad/prs.mjs lines 236-242, tools/squad/log-prune.mjs lines 1-3.
Verify: `run typecheck`, then `run test` on tests/squad-gate.test.ts, tests/squad-pack.test.ts, tests/squad-prs.test.ts and tests/squad-log-prune.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#457, comment review of this branch against code-standards rule 7): four comments either restate the code, sit apart from the block they belong to, or no longer match it.

1. tools/squad/gate.mjs: delete the two-line comment that starts `// The verdict is not a reason since #449`, and add to the end of the comment block right above `export function readiness` this sentence: `The verdict is not a reason (#449): the pack asks for changes exactly when a finding is critical or high, and the findings are what this reads.`
2. tools/squad/pack.mjs: the comment `// (the -- above keeps the paths from being read as options; base was checked as a commit already)` becomes `// (the -- above keeps the paths from being read as options; mergeBase is a sha from git itself)`.
3. tools/squad/prs.mjs: delete the comment line above `if (last.code !== 0 && last.stderr.trim())`: it restates that line, and the runAsync comment already gives the reason.
4. tools/squad/log-prune.mjs lines 1-2: one comment line, `// Prunes the role logs run.mjs writes to the logs folder beside the cost ledger (#357, #453). The ledger is the lasting record; the logs are only for recent debugging, so the newest ones stay.` (wrap at ~120 columns).

Files: tools/squad/gate.mjs, tools/squad/pack.mjs, tools/squad/prs.mjs, tools/squad/log-prune.mjs
