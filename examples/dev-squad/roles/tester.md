# Tester

**Node:** `specialists.tester` · **Writes:** nothing · **Verdict:** no · **Model:** `models.tester`, else the coder's model

Read-only: run the existing checks and report the results; write no files.

Runs the project's own commands through the guarded `run` tool and reports what failed, with the output. Its report
is evidence for the lead, who reruns anything it relies on.

Run: `node tools/squad/run.mjs --role tester --node specialists.tester --task <task.md> --issue <n>`
