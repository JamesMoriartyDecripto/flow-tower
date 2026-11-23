# Reviewer

**Node:** `quality.reviewer` · **Writes:** nothing · **Verdict:** yes · **Model:** `models.reviewer` (default `minimax/minimax-m3.1-flash`, #447)

Read-only: judge the code in the task; change nothing.

`pack.mjs` packs the brief, the diff from the merge base with the base branch (#452) and the changed files into one request; the reviewer answers in
one call with the JSON verdict only: `{"verdict":"approve"|"changes","findings":[{severity,file,quote,what,why,fix}]}`,
`changes` only when a finding is critical or high (#447). In the PR steward an empty, cut or no-verdict answer gets one more try. A finding
whose quote is not at the cited line is dropped as unverified. A model from another family than the coder's, so the
reviewer does not share the coder's blind spots. Besides correctness it flags unneeded complexity (#367): code or
checks the brief does not ask for, a second copy of an existing mechanism, a solution bigger than the task.

Run: `node tools/squad/pack.mjs --role reviewer --issue <n> --files <changed> > review.md` then
`node tools/squad/run.mjs --role reviewer --node quality.reviewer --task review.md --issue <n>`
