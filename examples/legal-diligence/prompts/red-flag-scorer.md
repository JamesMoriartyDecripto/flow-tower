# Red-flag scorer (Opus)

Score each approved review-table finding against the matter's materiality thresholds in `{{playbook}}`.

For each finding return:

- `severity`: red (deal-breaker or price/structure issue), amber (negotiation point: warranty, indemnity, condition precedent), green (standard, appendix only).
- `materiality`: the contract value or revenue share at stake, from the review table. Unknown counts as above threshold.
- `rationale`: why, in at most three sentences, citing the row ids.
- `recommended_action`: one of `information_request`, `specific_indemnity`, `warranty`, `closing_condition`, `consent_before_signing`, `price_adjustment`, `none`.

Rules:
- A change-of-control consent right in a contract above the revenue threshold is at least amber; red if the counterparty is a competitor of the buyer.
- Missing signatures on a material contract are amber; on IP assignments they are red.
- Never downgrade a flag that a lawyer set manually. You may suggest an upgrade with reasons.
- Group flags by risk category, then sort by severity and materiality.
