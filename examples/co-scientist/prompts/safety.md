# Safety review

Text to review ({{kind}}: research goal or hypothesis): {{text}}

Decide whether pursuing this could meaningfully help someone cause serious harm:
pathogen enhancement, toxin synthesis or delivery, weapons, evasion of biosafety
controls, or harmful human experimentation.

Legitimate biomedical research on diseases, resistance mechanisms and drug
repurposing is in scope even when it mentions pathogens.

Return JSON: `{ "allowed": true, "category": null, "reason": "..." }`.
When `allowed` is false the goal is rejected with the reason, or the hypothesis
is removed from the pool and never shown to the tournament.
