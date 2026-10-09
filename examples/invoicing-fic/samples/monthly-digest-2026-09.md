# Finance digest: September 2026

Brezza Sensori S.r.l. (fictional) · prepared by the finance analyst agent on 2026-10-03 · all figures
illustrative · query ids in brackets refer to the ledger query log.

## Headline

- Issued **142** documents (138 invoices, 4 credit notes) for **612,480 EUR** gross [q-0931].
- Collected **571,900 EUR**; DSO **54 days** (August 57) [q-0932].
- SDI scarto rate **0.7 %** (1 of 142): 00311 codice destinatario typo, fixed and resent in 1 day [q-0933].
- Two items wait on people: one CFO approval (credit note, 3,900 EUR) and one supplier invoice without a PO.

## Order to cash

| Metric | Sept | Target | Note |
|---|---|---|---|
| Median days from effettuazione to issue | 1.1 | ≤ 2 | 3 invoices on day 9–10 (PA CIG missing) |
| Auto-issued (recurring, unchanged, < 5k) | 61 % | — | 87 of 142 |
| Controller approvals, median wait | 2.4 h | ≤ 24 h | 0 timeouts |
| SDI outcome: sent / not_delivered / PA accepted | 118 / 9 / 14 | — | not_delivered: clients without a code, notified by email |
| Bollo charged (2 EUR) | 11 invoices | — | all intra-EU or N2.1 services |

## Collections

| Metric | Sept | Target |
|---|---|---|
| Bank transactions auto-matched | 88 % (309 / 351) | ≥ 85 % |
| Agent suggestions confirmed by AR | 93 % (39 / 42) | ≥ 90 % |
| Paid within 15 days of the D+3 reminder | 71 % | ≥ 65 % |
| Accounts at D+45 | 2 | — |

- Credit notes: 4 (pricing error ×2, returned goods, PA refusal). Approvers: controller ×4, CFO ×1.
- Write-offs: none. Fonderie Arni S.r.l. on a 3-instalment plan approved by the credit manager.

## Passive cycle

- 96 received e-invoices; 81 matched to PO within tolerance, 12 approved by budget owners, 3 open.
- 7 freelancer invoices with ritenuta (RT01): 2,184 EUR withheld, F24 due 16 October.
- 1 supplier IBAN change blocked pending call-back (Ottica Senni S.r.l.).

## VAT and compliance

- VAT data sent to the commercialista on 2 October; liquidation due 16 October [q-0940].
- Split-payment VAT on PA invoices (not collected): 18,920 EUR.
- Q3 bollo: 31 invoices → 62 EUR. Elenchi A/B published 15 October, elenco B changes by 31 October, payment by 30 November.
- Conservazione: 238 documents in the AdE service; export bundle manifest hash recorded in the audit trail.

## 13-week cash-flow (estimate)

Lowest week: **w44** at 186,000 EUR after payroll and the F24 of 16 November. Main assumptions:
PA receipts at median 38 days late, the two D+45 accounts collected at 50 %, no new financing.

## LLM spend

142 USD of 180 USD budget (79 %). Opus briefs 61 USD, drafting 38 USD, the rest Haiku. No downgrade.
