# VAT and fiscal rules (draft.fiscal, draft.numbering)

The rules engine (`scripts/fiscal_checks.py`) applies this table. The line drafter only proposes a
`vat_case`; code maps it to a Fatture in Cloud VAT type id (`InfoApi.list_vat_types`, field
`ei_type` carries the natura) and checks the result. This is a working table for Brezza Sensori
(fictional), **not tax advice**: the commercialista owns it and signs off every change.

## Line-level cases

| vat_case | When | FatturaPA | Fatture in Cloud | SDI error if wrong |
|---|---|---|---|---|
| `std22` | Domestic B2B/B2C goods and services | AliquotaIVA 22.00, no Natura | VAT type 22 % | 00401 if a Natura is also set |
| `pa_split` | Client is a PA or other split-payment entity | EsigibilitaIVA `S` | `use_split_payment: true` | 00420 if combined with N6.x |
| `rc_n6_3` | Subcontracting in construction (not used by Brezza today) | Natura N6.3, aliquota 0 | VAT type with `ei_type` N6.3 | 00400 if Natura missing at 0 % |
| `eu_services` | B2B services to an EU business (art. 7-ter) | Natura N2.1, aliquota 0 | VAT type N2.1 | 00400 |
| `eu_goods` | Intra-EU supply of goods (sensors shipped to DE) | Natura N3.2, aliquota 0 | VAT type N3.2 | 00400 |
| `export` | Goods exported outside the EU | Natura N3.1, aliquota 0 | VAT type N3.1 | 00400 |
| `exempt` | Exempt operations (art. 10), rare here | Natura N4 | VAT type N4 | 00400 |
| `bollo_line` | Re-charging the 2 EUR stamp duty to the client (business choice) | line not subject to VAT | item with `vat.id` 21 "0% Escluso Art.15" (per FIC guide; check id per company) | — |

## Document-level rules

| Rule | Check | Source |
|---|---|---|
| **Natura vs rate** | Rate 0 requires a Natura; rate > 0 forbids it (except TD16) | Spec. tecniche v1.9, errors 00400 / 00401 |
| **Split payment** | PA clients: `use_split_payment` true; VAT is shown but paid by the PA to the Treasury, so the amount due is net | art. 17-ter DPR 633/72; Council decision July 2026 extends it to 30/06/2029 |
| **Reverse charge vs split** | Never both on one document | error 00420 |
| **Bollo** | If the sum of lines with Natura N2.1, N2.2, N3.5, N3.6 or N4 exceeds 77.47 EUR: `stamp_duty` 2.00 and BolloVirtuale SI. 2 EUR per invoice regardless of the amount field | AdE guide "L'imposta di bollo sulle fatture elettroniche", June 2026 (elenco B criteria) |
| **Bollo payment** | Quarterly via portal or F24 codes 2521–2524: Q1 by 31 May (30 Sep if ≤ 5,000 EUR), Q2 by 30 Sep (30 Nov if Q1+Q2 ≤ 5,000 EUR), Q3 by 30 Nov, Q4 by 28 Feb. Elenchi A/B published on the 15th of the month after the quarter; elenco B editable until the end of that month (Q2: 10 Sep) | same guide |
| **Ritenuta d'acconto** | Brezza (S.r.l.) does not suffer withholding on its sales. On received invoices from freelancers: DatiRitenuta RT01 (persone fisiche) with 20 % rate, paid net, F24 by the 16th of the following month | Spec. tecniche v1.9 (TipoRitenuta RT01/RT02); error 00411 if lines flag Ritenuta SI without DatiRitenuta |
| **Forfettario suppliers** | Received invoices with RegimeFiscale RF19 carry no VAT (Natura N2.2) and no ritenuta; bollo 2 EUR above 77.47 EUR | AdE guide "La fattura elettronica e i servizi gratuiti", Dec 2025 |
| **Totals** | PrezzoTotale and Imposta must match the computation rules; use `get_new_issued_document_totals` and compare with the order | errors 00421 / 00423 |
| **Credit notes** | TD04 referencing the original number and date; never edit or delete an issued invoice | Guida compilazione FE v1.9 |

## Dates and numbering

| Rule | Check |
|---|---|
| Immediate invoice | Issue within **12 days** of effettuazione (art. 21 c. 4 DPR 633/72). Alert at day 8, block auto-issue at day 10. |
| Deferred invoice | TD24 (goods with DDT) or TD25 by the **15th of the following month**, one invoice per client per month. |
| Invoice date | Never later than the date the SDI receives the file (error 00403). Use the date of the last operation for deferred invoices. |
| Numbering | Progressive per numeration and year, no gaps. A number is used only when Fatture in Cloud creates the document; drafts never reserve numbers. |
| Duplicates | SDI rejects a file with the same supplier id, year and number already processed (00404) unless the previous one was rejected. |
| Scarto | A rejected invoice is not issued. Resend with the **same number and date within 5 days** of the rejection notice (circolare 13/E/2018), else new number in a sezionale (e.g. `12/R`). |

## Data minimization

Descriptions name the product or service only. No employee names, health data or legal case
details in descriptions or attachments (Garante privacy, provvedimento 20/12/2018).
