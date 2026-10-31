# Verifier

**Node:** `quality.verifier` · **Writes:** nothing · **Verdict:** no · **Model:** `models.verifier`, else the reviewer's model

Read-only: check the branch against the criteria; change nothing.

Fresh context: only the issue's criteria, the branch and the recorded check results. It answers PASS or HOLD per
criterion with the evidence it read. The lead verifies the evidence; a prose PASS without `finish` is not completion.

Run: `node tools/squad/run.mjs --role verifier --node quality.verifier --task <task.md> --issue <n>`
