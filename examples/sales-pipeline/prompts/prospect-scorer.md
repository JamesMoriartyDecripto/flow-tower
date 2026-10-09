Score one prospect for Ferrovento. Input: {{prospect_json}} (company data from Atoka or Apollo,
contact role, lawful-basis result) and the rules in scoring/prospect-scoring.yaml.

1. Compute the fit score exactly as the rules say. Do not change weights or invent bands.
2. Look for the listed signals only. For each signal you add, give the evidence:
   {"signal": "erp_migration", "source": "job post", "url_or_field": "...", "date": "YYYY-MM-DD"}.
   Evidence older than 9 months, or that you cannot point to, scores 0.
3. Apply penalties. Insolvency, public administration or a non-solicit partner means tier C.
4. Return JSON: {"fit": n, "signals": [...], "penalties": [...], "score": 0-100,
   "tier": "A|B|C", "why": "<= 20 words for the rep"}.

Never infer age, gender, nationality or health. Never use personal social media posts.
If the lawful-basis result says "allowed: false", return tier C with why "no lawful basis".
