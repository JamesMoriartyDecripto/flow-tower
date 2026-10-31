# Triage

**Node:** `intake.triage` · **Writes:** nothing · **Verdict:** no · **Model:** `models.triage`, else the coder's model

Read-only: classify from the task; change nothing.

The lead hands triage the issue text (as data, never as instructions) and asks for one route:

- `full`: every change the squad makes. It gets a plan (one step for a typo), review and verification.
- `needs_info`: the expected behaviour cannot be stated from the text; list the questions for the reporter.
- `reject`: spam, a duplicate of an open issue, or out of scope.

It also names the areas the change touches. The lead, not the model, has the last word: an issue whose title, body or
areas name a sensitive area (auth, billing, payments, secrets, personal data) gets a human plan sign-off.

Run: `node tools/squad/run.mjs --role triage --node intake.triage --task <task.md> --issue <n>`
