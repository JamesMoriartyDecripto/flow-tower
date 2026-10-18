---
id: tallymoor-landing-v2
category: writer
check: regex
rubric: true
steps: 1
---
# Landing-page section with a claims register (v2)

Replaces `tallymoor-landing`, whose must-not key also matched a note saying a claim was left out (wrong key, retired 2026-10-16). From real work: the marketing-studio example's writer (`examples/marketing-studio/prompts/writer.md`) and its claims register (`strategy/claims-register.yaml`).

## Prompt

You write for Tallymoor, accounts-payable automation for European mid-size companies. Write ONE landing-page section (200-300 words of body) for finance controllers who approve supplier invoices.

Rules:
- Lead with the reader's job, not with Tallymoor. First mention of the product after the problem is clear.
- Every number, comparison or compliance statement must come from the claims below with status approved. Cite its id in an HTML comment right after the sentence, like `<!-- claim: C-001 -->`. If you need a claim that is not there, write `[CLAIM NEEDED: ...]`.
- Original examples only (e.g. a 40-person AP team, 6,000 invoices a month). No invented customer names.
- Output Markdown with front matter: title (<= 60 chars), meta_description (<= 155 chars), slug.

Reply with the Markdown section only: no notes or explanations before or after it.

Claims register:
- C-001 approved: "Reads header and line items from supplier PDFs with 97 % field accuracy" (qualifier: measured on header + line-item fields; varies by supplier layout)
- C-002 approved: "Customers cut median approval time from 9 days to 3 days" (qualifier: median across cohort; individual results vary)
- C-003 proposed: "AP teams handle 2x the invoices per person after 6 months"
- C-004 approved: "Receives XRechnung, ZUGFeRD, Factur-X and Peppol BIS invoices"
- C-005 approved: "Typical payback in under 9 months" (qualifier: must link to the ROI method page)
- C-007 rejected: "The fastest AP automation in Europe"
- C-008 approved: "Customer data hosted in the EU only"

## Expected

```regex
---[\s\S]*title:[\s\S]*meta_description:[\s\S]*slug:[\s\S]*---
<!--\s*claim:\s*C-00[124568]\s*-->
9 days[\s\S]{0,40}3 days|3 days[\s\S]{0,60}9 days
```

```must-not
fastest
\b2\s?x\b|twice (as many|the invoices)
C-00[37]
```

Rubric (blind scorer, 0-10):
- 3 points: opens on the controller's problem; the product appears only after it.
- 3 points: every number traced to an approved claim id, with its qualifier where the register gives one (97 % varies by layout; 9 to 3 days is a median; payback links to the ROI method).
- 2 points: no proposed or rejected claim, no invented customer, no new numbers.
- 2 points: front matter within the length limits, plain B2B tone.
