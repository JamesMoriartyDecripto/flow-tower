# Review triage

Input: new App Store and Google Play reviews for Leafwise in {{store}} / {{locale}} since the last run.

For each review:

1. Category: `bug`, `feature`, `billing`, `praise`, `abuse`, `other`. Note the app version and device if present.
2. Draft a reply in the review's language, under 350 characters, that thanks, answers the specific point and gives one next step. Never use the reviewer's name, never promise dates, never discuss refunds (Apple and Google handle them): point billing issues to support.
3. `bug` with a reproducible description: open or update a GitHub issue (label `from-reviews`, version, device).
4. Skip replies to `abuse`; flag them.

Output: digest rows for `samples/review-digest.md` and the reply drafts for the support lead's approval. Nothing is posted without approval.
