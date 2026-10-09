# Legal Due Diligence

An M&A red-flag diligence desk for a law firm: data room in, cited red flag report out, a lawyer approving every step. Built on the Claude Agent SDK with Claude on Amazon Bedrock in `eu-central-1`, so confidential client documents are processed in-region.

```bash
node bin/flow-tower.js examples/legal-diligence
```

## Layers

| # | Layer | What happens |
|---|---|---|
| 1 | Matter Intake & Classification | Lead associate sets scope and thresholds; Datasite webhook → ethical wall → dedupe + Textract OCR → Haiku classifier (fan-out by 250-doc batch) → privilege screen → associate approves the classification queue. |
| 2 | Clause Extraction | Five parallel clause-family reviewers per document (change of control, assignment, exclusivity, termination, indemnities), deterministic quote verifier, review table, Opus consistency pass, associate review with red/yellow/green flags. |
| 3 | Red-Flag Scoring | Opus scores findings against the matter playbook; red flags alert the deal team at once; gaps become seller Q&A requests; senior associate approves. |
| 4 | Red Flag Report | Opus drafts from approved flags only, a citation gate blocks uncited sentences, the partner edits and signs off (max 3 rounds), filed to iManage. |
| 5 | Governance, Models & Audit | Region guard and audit hooks on every session, append-only audit trail (7 years), Haiku/Sonnet/Opus 5.5 on Bedrock EU, iManage with user credentials. |

Sub-tower: `towers/clause-review.tower.yaml` (double-click any clause reviewer) shows one session: definitions → search → read → answer → conditional columns → schema check → confidence split.

## Operational features exercised

- `approval` on five checkpoints (scope, classification, review table, flags, report) with `edit` actions, as in Harvey's "step in, edit, then approve" workflows: classification only `when: "confidence < 0.8 or privileged"`, `per: document`; flags `per: flag`; partner sign-off with `rounds: 3`.
- `data: { sensitivity: confidential, region: eu }` on every agent; `retention` with `retention_after: matter close` on the docstore and review table (180d) and audit trail (`7y`).
- `fanout` for batch classification and per-document clause review; `limits` with concurrency, retries and backoff; `budget` (`per: run` for the fan-outs) with `pause` / `escalate`.
- `decision`: severity as a `choice` over red / amber / green / information gap; in the sub-tower, clause presence and a confidence `threshold: 0.7`, with their branches as edge `group`s.
- `evals` (all `illustrative: true`): extraction accuracy, citation verified rate, associate edit rate (`higher_is_better: false`), BigLaw Bench-style answer and source scores.
- `version` + `rollout: shadow` for the v8 clause prompt; `sla` on review, alerts and delivery; `credentials: user` for DMS and VDR calls; `sandbox: { network: none }` for reviewers; `trigger: webhook`; edge `protocol` (webhook, queue, mcp, http).

## Sources

- Harvey case study (Claude models in Assistant, Vault and Workflows; checkpoints where users edit and approve; BigLaw Bench; multi-region capacity for local processing): https://claude.com/customers/harvey
- Harvey, red flag due diligence (scope thresholds, classify, extract across the full set, cluster and rank, cite each flag, lawyer sign-off): https://www.harvey.ai/blog/red-flag-due-diligence
- Harvey, collaborative review tables (diligence request list → columns, conditional columns, sentence-level citations, red/yellow/green flags): https://www.harvey.ai/blog/collaborative-review-tables
- Harvey Vault (up to 100,000 documents per vault, review tables, 96% key-term extraction claim, iManage integration): https://www.harvey.ai/en-US/platform/vault
- BigLaw Bench methodology (answer score and source score), via search results on: https://www.harvey.ai/blog/introducing-biglaw-bench
- Luminance Diligence (classify and cluster a data room, anomaly detection, comparison against model clauses), via search results on: https://www.luminance.com/product/diligence.html

Names, matter, numbers and URLs under `example-firm.eu` are fictional. Evals are illustrative, not measured.
