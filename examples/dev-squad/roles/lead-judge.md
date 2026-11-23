# Lead judge

**Node:** `autopilot.judge` · **Writes:** nothing · **Verdict:** no · **Model:** `models.lead-judge` (default `google/gemini-4-carbon`, #447)

Read-only: keep or drop each review finding; change nothing.

Input: the brief (what the pull request is for and what is already decided), the packed diff, and the reviewer's and
security auditor's findings. For each finding it answers keep or drop, with a reason:

- **keep**: a real defect that the pull request introduces, or makes reachable or worse even on a line it does not
  touch. The kept findings of a round share one fix step, each with its reason (#462).
- **drop**: wrong, harmless, already handled, or a pre-existing defect the pull request does not affect. The reason
  goes on the issue; pre-existing defects go to a follow-up issue.

`runner.mjs` calls it after every review round; the interactive lead makes the same call by hand. On the squad's real findings (#447 benchmark, four real pull
requests), Gemini 4 Carbon got 18 of 18 keep/drop sets right; Claude Sonnet 5.5, the default before, got 15, and one of its
misses dropped a critical finding. Opus, Fable and Terra dropped the security findings as "out of scope".
