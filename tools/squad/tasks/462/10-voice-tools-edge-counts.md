# 462-10: the voice tools test reads the Lead and Coder edge counts of the corrected tower

Rules: English only; never touch secret files; edit only the files named below; comments explain why; files under ~400 lines.
Read tests/voice-tools.test.ts lines 55-85, examples/dev-squad/dev-squad.tower.yaml (the intake.lead and specialists.coder nodes, their edges and the links that name them).
Verify: `run typecheck`, then `run test` on tests/voice-tools.test.ts; `finish` with the output and a `Known gaps:` line. steps.sh runs the full check after finish.

Why (#462): the tower check removed two edges that the code disproves, `researcher -> coder` (the lead checks the researcher's answers and writes them into the tasks) and `green -> coder` (a red step stops the chain; the lead edits the task file), and added the link `intake.lead -> runner.steward`. The test still expects the old counts.

1. tests/voice-tools.test.ts, the compare test around line 75: Lead becomes `{ incoming: 3, outgoing: 3 }` and Coder `{ incoming: 1, outgoing: 1 }`. Count them yourself from the tower before you write them, and rewrite the two comment lines above so they name the edges that now come in and go out of each node.

Files: tests/voice-tools.test.ts
