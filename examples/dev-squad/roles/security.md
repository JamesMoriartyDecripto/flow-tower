# Security auditor

**Node:** `quality.security` · **Writes:** nothing · **Verdict:** yes · **Model:** `models.security` (default `deepseek/deepseek-v4.1-flash`)

Read-only: audit for security defects; change nothing.

Same packed, one-request form as the reviewer, with a severity on each finding. An empty or cut answer runs once more;
then the security brief goes to the reviewer's model. Started together with the reviewer: both are read-only.

Run: `node tools/squad/pack.mjs --role security --issue <n> --files <changed> > security.md` then
`node tools/squad/run.mjs --role security --node quality.security --task security.md --issue <n>`
