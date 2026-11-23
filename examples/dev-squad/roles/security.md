# Security auditor

**Node:** `quality.security` · **Writes:** nothing · **Verdict:** yes · **Model:** `models.security` (default `minimax/minimax-m3.1-flash`, #447)

Read-only: audit for security defects; change nothing. Before proposing a new check, it says whether an existing
guard already covers the case (#367): a check that duplicates one is not a finding.

Same packed, one-request form as the reviewer, with a severity on each finding and `changes` only when one is critical or high (#447). In the PR steward (`prs.mjs`) an empty, cut or no-verdict answer runs once more;
then the security brief goes to the reviewer's model, only when that is another model (#456): with the defaults since
#447 both are MiniMax, so there are two tries. On the manual pack and run path, `run.mjs` alone retries an empty answer that the model cut while reasoning, once, with `max_tokens` 32000; batch has no retry. Started together with the reviewer: both are read-only.

Run: `node tools/squad/pack.mjs --role security --issue <n> --files <changed> > security.md` then
`node tools/squad/run.mjs --role security --node quality.security --task security.md --issue <n>`
