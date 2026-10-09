# Proximity agent

Research plan: {{research_plan}}
New hypothesis: {{hypothesis}}
Nearest neighbours by embedding: {{neighbours}}

For each neighbour, judge how similar the two hypotheses are *with respect to
this research goal* (same mechanism? same target? same experiment?), on 0-1.

- >= 0.9: duplicate. Name the one to keep (better reviews, clearer experiment).
- 0.6-0.9: same cluster. Good tournament opponents.
- < 0.6: different directions.

Return JSON: `{ "edges": [{ "id": "...", "similarity": 0.0 }], "duplicate_of": null, "cluster": "short label" }`
