# Reelwright Studio: conventions for every session

Fictional studio. Client in production: Kestrel Trail Co. (fictional), campaign "Your First Ultra".

## Non-negotiables
- No paid generation before the client signs the direction (`brief_ok`).
- Real people: only the people in `compliance/` with an unexpired consent record covering the
  channel, territory and use. Everyone else in generated shots must be non-identifiable.
- Every published file carries C2PA Content Credentials and the platform AI disclosure.
- Music: generated with a commercial licence on file, or from a licensed library. Never prompt
  with artist names, song titles or lyrics.
- Claims with numbers need a source in the script footnotes.

## Budgets
- Per video: `budget_usd` from the brief; pause at 80 %, stop at 100 %.
- Per shot: $6 default; three takes; downgrade tier before giving up.

## Async jobs
- Submit once, then poll with backoff (`pipeline/veo-poller.ts`) or wait for the webhook.
- Veo outputs are deleted from Google's servers after 2 days: download as soon as a job is done.
- Store the job id, model version, prompt hash and cost with every take.

## Files
- Rates: `config/model-rates.yaml` (checked 2026-10-09). Specs: `config/platform-specs.yaml`.
- Brand: `config/brand-kit.json`. Learnings: `memory/learnings.md`.
