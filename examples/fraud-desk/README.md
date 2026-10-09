# Fraud Review Desk

A fintech fraud desk on **Claude Managed Agents** and **MongoDB Atlas**. A Haiku reviewer
works through a batch of pending payments using only host-side custom tools: the agent
loop runs on Anthropic's side, and every query runs in the host process with `pymongo`,
so the database credential never enters the agent context or the sandbox.

```bash
npx flow-tower examples/fraud-desk/fraud-desk.tower.yaml
```

## Layers

| Layer | What it shows |
|---|---|
| Case Intake | 5-minute batch of pending transactions, one session per batch, the `requires_action` gate loop |
| Agent Review | AP2 mandate hard gate, `get_transaction`, hybrid precedent search, fraud-ring check, threshold decision, `escalate`, terminal `record_decision`, exactly-one-terminal guard |
| Analyst Desk | Sonnet case packet, analyst queue (4h), senior analyst (24h, then decline), override labels, SAR referral (30d) |
| MongoDB Atlas | `$vectorSearch` + Atlas Search BM25 fused with `$rankFusion`, optional rerank, `$graphLookup`, decisions, append-only `audit_events`, `mandate_receipts` |
| Harness & Models | limited network environment, host-side secrets, insert-only audit role, budget, Console trace, models |

Escalation thresholds are labeled conditional edges on the **Escalate?** decision:
structuring $4,900 to $4,999, ≥ $50,000 when the agent would approve, confidence 75 to 85,
and a fraud-ring hit.

## Operational fields used

`trigger` (cron), `approval` (analyst 4h `on_timeout: escalate`, senior 24h `on_timeout: reject`),
`sla` (24h senior, 30d SAR), `budget` ($0.50 per batch, `on_exceed: pause`), `limits` (session `ttl`,
concurrency 1), `sandbox` (no network, no filesystem), `credentials: service`, `data` (PII, US,
5-year retention), `evals` (analyst agreement, threshold recall, terminal-call rate, cost per case),
`version` + `rollout` (v4 in shadow against v3), edge `protocol: event`, a `recording` resource.

## Additions beyond the cookbook

The cookbook demo has no timeout, packet writer, SAR referral or terminal-call guard, and it
treats `audit_events` as append-only by convention. Here the host refuses a second
`record_decision`, nudges for missing ones, and the Atlas custom role in
`config/audit-role.json` makes the audit store insert-only. `data/pending_sample.jsonl` is
the five cookbook cases, without embeddings and mandate JWTs.

## Sources

- https://platform.claude.com/cookbook/managed-agents-cma-with-mongodb-atlas
- https://www.mongodb.com/docs/manual/reference/operator/aggregation/rankfusion/
- https://platform.claude.com/docs/en/managed-agents/tools (custom tools, `requires_action` loop)
