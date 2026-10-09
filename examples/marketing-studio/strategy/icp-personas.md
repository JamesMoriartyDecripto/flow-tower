# ICP and personas — Tallymoor (fictional), Q4 2026

Source: 412 tagged VoC quotes (reviews 138, call transcripts 171, tickets 64, win/loss 39),
mined 2026-10-01. Quote ids in brackets refer to `data/voc-sample.jsonl` and the full mart table.

## Ideal customer profile

| Dimension | Fit A | Fit B | Disqualify |
|---|---|---|---|
| Country | DE, NL, FR | AT, BE, CH | outside EU/EFTA |
| Employees | 200-2,000 | 100-199 or 2,001-5,000 | < 50 |
| Invoices / month | 2,000-20,000 | 800-1,999 | < 300 |
| ERP | SAP S/4HANA, Microsoft Dynamics 365 BC/F&O, Exact | NetSuite, DATEV-connected | no ERP / spreadsheets only |
| AP team | 3-25 people | 2 | 1 part-time |

**Trigger events** (raise intent): ERP migration in the next 12 months; new CFO or controller;
e-invoicing obligation coming into force in their country; audit finding on approvals [v-0113];
AP team turnover or a hiring freeze [v-0042].

**Disqualifiers:** fully outsourced AP (BPO contract > 2 years), public sector tenders, companies
already on a suite AP module they are happy with (no pain quote in discovery).

## Personas

### AP lead ("Petra", runs a team of 6-12)
- **Job:** close every invoice on time without overtime at month end.
- **Pains, in their words:** "We still re-key every PDF into SAP" [v-0007]; "approvals sit in
  someone's inbox for two weeks" [v-0021]; "I can't see which invoices are stuck" [v-0058].
- **Must prove internally:** fewer touches per invoice, no duplicate payments.
- **Objections:** "Another tool my team has to learn"; "Will it read our supplier formats?"

### Controller / Head of Accounting
- **Job:** a clean, auditable close and accurate accruals.
- **Pains:** "Accruals are a guess because invoices arrive late" [v-0090]; audit sampling pain.
- **Must prove:** approval trail, segregation of duties, period-end cut-off.
- **Objections:** ERP posting logic, migration effort.

### CFO (mid-market)
- **Job:** finance headcount flat while revenue grows; cash visibility.
- **Pains:** "We hired two people last year just to keep up with invoice volume" [v-0131].
- **Must prove:** payback period, risk (fraud, duplicate payments), compliance readiness.
- **Objections:** total cost, vendor risk, data residency (EU hosting required).

### ERP / IT owner
- **Job:** no fragile integrations, no shadow IT.
- **Must prove:** certified connectors, SSO, EU data residency, DPA, sub-processor list.
- **Objections:** security review length, "we are mid-migration".

## What changed since Q3
- Added *ERP migration* as the strongest trigger (31 quotes, intensity 3 in 19).
- Downgraded companies under 200 employees to Fit B: low win rate (9 %) and long payback.
