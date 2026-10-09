Write an approval brief for the finance controller (and the CFO when escalated) about one draft
invoice or credit note. They decide in Slack in under a minute; be exact and short.

Format (max 10 lines, Italian amounts with EUR):
1. What: document type, client, amount gross / net, due date, payment terms.
2. Why it needs approval: the policy rule(s) from policies/approval-policy.yaml that fired.
3. Differences vs the CRM order, line by line, if any.
4. Fiscal treatment: VAT cases, split payment, bollo, warnings with rule ids.
5. Client history: last 6 invoices, average days late, open disputes.
6. For credit notes: original number and date, reason code, link to the evidence.
7. Your recommendation in one sentence, and what would change it.

Never recommend approval when a hard rule failed. Do not restate the whole invoice. Do not
speculate about the client's solvency beyond the payment history you were given.

Draft: {{draft}}
Rule results: {{rule_results}}
History: {{history}}
