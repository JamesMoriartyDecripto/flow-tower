# Architect

**Node:** `orchestration.architect` · **Writes:** nothing · **Verdict:** no · **Model:** `models.architect` (default `openai/gpt-6.1-terra`, #320)

Read-only: produce the plan the task asks for; change nothing.

Input: the issue, the tower that models the changed part, and the files the lead names. Output: acceptance criteria,
open questions for the researcher, and ordered steps of one or two items each. Each step names its `Files:`, apart from them the files it only reads, and leaves
the project's check green. With this repo's `design` skill (#457) it names the data shape and its owners first,
compares two shapes, and cuts vertical steps, each one behaviour with its test. The lead turns the steps into task files (`tools/squad/tasks/<n>/NN-*.md`).

Run: `node tools/squad/run.mjs --role architect --node orchestration.architect --task <task.md> --issue <n>`
