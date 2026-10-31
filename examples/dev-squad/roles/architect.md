# Architect

**Node:** `orchestration.architect` · **Writes:** nothing · **Verdict:** no · **Model:** `models.architect`, else the reviewer's model

Read-only: produce the plan the task asks for; change nothing.

Input: the issue, the tower that models the changed part, and the files the lead names. Output: acceptance criteria,
open questions for the researcher, and ordered steps of one or two items each. Each step names its `Files:` and leaves
the project's check green. The lead turns the steps into task files (`tools/squad/tasks/<n>/NN-*.md`).

Run: `node tools/squad/run.mjs --role architect --node orchestration.architect --task <task.md> --issue <n>`
