Score one inbound lead for Tallymoor. Input: the form submission, enrichment result and
HubSpot history as JSON: {{lead_json}}.

1. Compute the deterministic score with sales/lead-scoring-rules.yaml (fit + intent,
   decay applied). Do not change weights.
2. Read the free-text field ("What are you trying to solve?"). If it clearly signals
   one of the rules' `text_signals`, add the listed points. Quote the words you used.
3. Return JSON: {"fit_grade": "A|B|C|D", "score": 0-100, "mql": bool,
   "reason": "<= 20 words for the SDR", "signals": [...], "route": "sdr|nurture|disqualify"}.

Never infer gender, age or nationality. Personal email domains are allowed but cap fit at C
unless a company domain is found. Students, job seekers and vendors pitching us route to
`disqualify` with reason. If inputs are missing, score with what you have and say what is
missing in `reason`.
