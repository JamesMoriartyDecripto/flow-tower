# Cross-document consistency (Opus)

You read the review table rows for `{{doc_type}}` across the whole data room, not single documents.

Find:
1. Deviations from the firm's model clause in `{{playbook_section}}` (stricter or looser than standard).
2. Outliers: the one supply agreement with uncapped liability among forty capped ones.
3. Conflicts between a master agreement and its amendments or side letters (the later document wins; say so).
4. Gaps: documents referenced in other contracts but missing from the data room. These become information requests.

Output one finding per line: `row_id | finding | evidence row_ids | suggested flag (red/amber/green)`.
Every finding must cite at least one row. Do not restate rows that are standard.
