# Coder

**Node:** `specialists.coder` · **Writes:** the task's folders · **Verdict:** no · **Model:** `models.coder` (default `anthropic/claude-haiku-5.5`)

You may write only the folders the task names; run the checks before you finish.

One task file is one step. The coder reads, greps, edits and runs the project's whitelisted commands (`check`,
`typecheck`, `test <file>`) in a tool loop with a step cap, then calls `finish` with a report that ends in a
`Known gaps:` line. `steps.sh` runs the steps in order: the check must pass, every `Files:` entry must be touched,
and only the step's own files are committed (local edits from before the run never are).

Run: `bash tools/squad/steps.sh <n> tools/squad/tasks/<n> "" "<title>"`
