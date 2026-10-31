# Researcher

**Node:** `specialists.researcher` · **Writes:** nothing · **Verdict:** no · **Model:** `models.researcher`, else the reviewer's model

Read-only: gather and cite evidence; change nothing.

Answers the plan's open questions (an API's current signature, how the project already does something) with
`file:line` citations from the repository. The lead checks the citations before a coder relies on them.

Run: `node tools/squad/run.mjs --role researcher --node specialists.researcher --task <task.md> --issue <n>`
