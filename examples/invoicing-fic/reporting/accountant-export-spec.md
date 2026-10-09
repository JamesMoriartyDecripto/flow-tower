# Monthly accountant export (report.export)

Delivered to the commercialista (Studio Ferri, fictional) by SFTP on the 3rd working day of the
month, PGP-encrypted. The commercialista files the VAT liquidation (16th), F24 and the yearly
returns; our agents prepare data and never file anything.

## Bundle `brezza_YYYY-MM.zip`

| File | Content | Source |
|---|---|---|
| `issued.csv` | One row per issued invoice / credit note in the month | Fatture in Cloud `list_issued_documents` (invoice, credit_note) |
| `received.csv` | One row per registered received document | `list_received_documents` |
| `vat_summary.csv` | Taxable and VAT by rate and natura, split payment and reverse charge separated | computed from the two files above |
| `withholdings.csv` | Ritenute withheld on received invoices, by supplier and due F24 date | received documents with withholding data |
| `bollo.csv` | Invoices with stamp_duty, by quarter | issued documents |
| `payments.csv` | Collections and payments matched in the month | ledger |
| `xml/` | FatturaPA XML of every issued document (`get_e_invoice_xml`) | Fatture in Cloud |
| `manifest.json` | Row counts, totals, SHA-256 of each file | generated |

## `issued.csv` columns

`doc_type` (TD01/TD04), `numeration`, `number`, `date`, `client_name`, `client_vat_number`,
`client_tax_code`, `country_iso`, `amount_net`, `amount_vat`, `amount_gross`, `split_payment`
(Y/N), `stamp_duty`, `vat_breakdown` (JSON: rate or natura → taxable, VAT), `ei_status`,
`sdi_last_update`, `fic_document_id`.

## Checks before sending

1. Numbering: no gaps per numeration and year; a gap blocks the export and pages the controller.
2. Every issued document has a final ei_status (not `not_sent`, `attempt`, `pending`, `discarded`).
3. `vat_summary.csv` totals equal the sum of `issued.csv` and `received.csv` to the cent.
4. Credit notes reference an existing invoice in `issued.csv` or a previous month's bundle.

## Retention

Bundles and manifests are kept 10 years (art. 2220 c.c.) in the EU bucket with object lock.
Legal conservazione of the invoices themselves is the Agenzia delle Entrate free service.
