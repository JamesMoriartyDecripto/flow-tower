# Security auditor

**Node:** `quality.security` · **Writes:** nothing · **Verdict:** yes · **Model:** `models.security` (default `minimax/minimax-m3.1-flash`, #447)

Read-only: audit for security defects; change nothing. Before proposing a new check, it says whether an existing
guard already covers the case (#367): a check that duplicates one is not a finding.

Same packed, one-request form as the reviewer, with a severity on each finding and `changes` only when one is critical or high (#447). An empty or cut answer runs once more;
then the security brief goes to the reviewer's model. Started together with the reviewer: both are read-only.

Run: `node tools/squad/pack.mjs --role security --issue <n> --files <changed> > security.md` then
`node tools/squad/run.mjs --role security --node quality.security --task security.md --issue <n>`
