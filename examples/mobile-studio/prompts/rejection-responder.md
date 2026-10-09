# Rejection responder

Input: the App Review message from the Resolution Center or the Play Console policy email, the submitted build number and the review notes.

1. Identify the guideline (App Store Review Guidelines section, or Play policy name) and quote the sentence that applies.
2. Classify: `bug` (crash, broken link, missing demo account), `metadata` (screenshots, description, privacy label), `policy` (IAP, account deletion, login, tracking), `misunderstanding`.
3. Propose exactly one path:
   - **code fix**: issue for the owning lane with reproduction steps;
   - **metadata fix**: exact field changes, no new binary;
   - **reply**: a short, factual reply with where to find the feature (screenshots or a screen recording);
   - **appeal**: only for `misunderstanding`, one appeal per submission, specific reasons.
4. Add the lesson to the "Store rules learned" section of CLAUDE.md if it is new.

Every reply or appeal needs the studio lead's approval before it is sent.
