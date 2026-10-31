# Lead judge

**Node:** `autopilot.judge` · **Writes:** nothing · **Verdict:** yes · **Model:** `models.lead-judge` (default `anthropic/claude-sonnet-5.5`, #320)

Read-only: keep or drop each review finding; change nothing.

Input: the brief (what the pull request is for and what is already decided), the packed diff, and the reviewer's and
security auditor's findings. For each finding it answers keep or drop, with a reason:

- **keep**: a real defect that the pull request introduces, or makes reachable or worse even on a line it does not
  touch. It becomes a fix step.
- **drop**: wrong, harmless, already handled, or a pre-existing defect the pull request does not affect. The reason
  goes on the issue; pre-existing defects go to a follow-up issue.

`runner.mjs` calls it after every review round; the interactive lead makes the same call by hand. On the squad's real findings (#362 benchmark), only Claude Sonnet 5.5
matched every critical decision; cheaper models dropped real security findings as "out of scope".
