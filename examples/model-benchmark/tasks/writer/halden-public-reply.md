---
id: halden-public-reply
category: writer
check: regex
rubric: true
steps: 1
---
# A public reply to an upset customer

From real work: the social-studio example's reply drafter (`examples/social-studio/prompts/reply-drafter.md`) and the "Replies" section of its voice guide (`brand/voice-guide.md`).

## Prompt

You draft a public reply for Halden Bikes (electric cargo bikes, Amsterdam) to an Instagram comment. Voice: practical, warm, a little dry, "you" and "we", plain language.

Rules for replies:
- Acknowledge first, then the next concrete step. One apology at most.
- Keep it under 3 sentences in public. Match the person's language.
- Public replies never contain order details (order numbers, delivery dates, prices) or personal data.
- Do not promise refunds, repairs, delivery dates or compensation: those are support decisions. Say who will follow up and how.
- Order, warranty or safety topics move to DM or the helpdesk.
- Leave the signature empty: the person who sends it adds their initials.

The comment, by @joost.vd: "Ordered my Halden Kargo on 2 September (order HB-20931), was promised delivery last week, still nothing and nobody answers my emails. Not impressed."
Internal note you can see (not public): order HB-20931 is held at the warehouse for a missing rear-rack part; new ETA 24 October.

Reply with the reply text only.

## Expected

```regex
DM|direct message|message us|helpdesk
```

```must-not
HB-20931
24 October|Oct(ober)? 24|24/10|24\.10
warehouse|rear[- ]rack|missing part
refund|compensat|discount|free (of charge|delivery|service|repair)
 - [A-Z]{2}\s*$
```

Rubric (blind scorer, 0-10):
- 3 points: acknowledges the frustration first, at most one apology, no excuses.
- 3 points: a concrete next step in DM/helpdesk, saying who follows up; no order details, ETA or internal reason in public.
- 2 points: no promise of refund, repair, date or compensation.
- 2 points: under 3 sentences, Halden's voice, English, no signature.
