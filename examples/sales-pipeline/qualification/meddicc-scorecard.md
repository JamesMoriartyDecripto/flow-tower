# MEDDICC scorecard

Filled by the MEDDICC scorer from the call transcript, then confirmed or corrected by the AE.
Each element scores 0-3. Every score above 0 needs a **verbatim quote** with a timestamp, or a
CRM field, as evidence. No evidence, no points.

| Element | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **M**etrics | none | vague ("faster reports") | number named ("close in 14 days") | number + target + value in EUR |
| **E**conomic buyer | unknown | named | met or on the next call | confirmed budget owner and process |
| **D**ecision criteria | unknown | generic | listed by the buyer | listed and we fit each one |
| **D**ecision process | unknown | steps guessed | steps and people named | steps, dates and paper process (procurement, legal) |
| **I**dentify pain | none | symptom | business impact stated | impact + cost of doing nothing |
| **C**hampion | none | friendly contact | has power and interest | has acted for us (intro, internal meeting) |
| **C**ompetition | unknown | "looking around" | named alternatives (incl. in-house) | our differentiation accepted |

**Qualified** (move to Proposal): total >= 14 of 21 **and** Metrics >= 2, Economic buyer >= 1,
Identify pain >= 2, **and** the AE agrees. Otherwise: nurture with the missing elements as tasks.

## Output (JSON written to HubSpot deal properties)

```json
{
  "deal_id": "hs-deal-0000",
  "scores": { "metrics": 2, "economic_buyer": 1, "decision_criteria": 2, "decision_process": 1,
              "identify_pain": 3, "champion": 2, "competition": 1 },
  "total": 12,
  "evidence": [
    { "element": "identify_pain", "quote": "la chiusura ci prende dieci giorni lavorativi", "at": "00:07:41" }
  ],
  "gaps": ["Who signs above 30k?", "Paper process: procurement involved?"],
  "next_step": { "what": "Call with CFO", "date": "2026-10-16" },
  "qualified": false
}
```

## Rules for the scorer

- Quote, do not paraphrase. If a quote is ambiguous, score the lower value.
- Never score from the AE's own statements on the call, only from the buyer's.
- Do not record health, family or other personal details mentioned in small talk.
- Recording and transcription happen only after participants were told and agreed at the start
  of the call; if the transcript has no such confirmation, stop and flag it.
