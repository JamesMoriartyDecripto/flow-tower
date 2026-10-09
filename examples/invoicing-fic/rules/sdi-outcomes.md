# SDI outcomes: what each status means and what we do

Fatture in Cloud is the transmitting intermediary, so the SDI receipts reach us as the
`ei_status` of the issued document. The status values and their meanings come from the Fatture
in Cloud "E-Invoice management" guide. The **SDI message** column is our mapping to the
Agenzia delle Entrate receipts (ricevuta di consegna, ricevuta di scarto, ricevuta di
impossibilità di recapito, esito committente, decorrenza termini); Fatture in Cloud does not
document this mapping, so treat it as an interpretation.

| ei_status | Meaning (FIC guide) | SDI message (our mapping) | Issued? | Action | Owner |
|---|---|---|---|---|---|
| `not_sent` | not yet sent | — | no | send (sub-tower) | workers |
| `attempt` | trying to send, wait up to 2 h | — | no | wait; sweep after 2 h | workers |
| `pending` | signature and send checks in progress | — | no | wait | workers |
| `sent` | sent | after RC (ricevuta di consegna) | **yes** | courtesy PDF; start dunning clock | workers |
| `processing` | SDI is delivering to the customer | in transit | not yet | wait; sweep | workers |
| `not_delivered` | SDI could not deliver | MC / impossibilità di recapito | **yes** (date = invoice date) | email the client that the invoice is in their Fatture e Corrispettivi area | workers |
| `discarded` | rejected by SDI; correct and resend | NS / ricevuta di scarto | **no** | read `error_reason`, fix, resend same number and date within 5 days | fixer + controller |
| `error` | error handling the invoice | — | no | read reason; retry once; else open a Fatture in Cloud support ticket | controller |
| `accepted` | customer accepted (PA) | NE notifica di esito (accepted) | yes | none | — |
| `rejected` | customer rejected (PA) | NE notifica di esito (refused) | yes, but contested | credit note (TD04) + corrected invoice after the controller agrees | controller |
| `no_response` | no response within the deadline (PA) | DT decorrenza termini (15 days) | yes | none; after DT the SDI refuses further messages on that file | — |
| `manual_accepted` / `manual_rejected` | outcome recorded manually | — | yes | as accepted / rejected | controller |
| `missing` | the invoice is missing | — | ? | page finance ops | controller |

`ei_status` is returned only with `fields=ei_status` or `fieldset=detailed`. The webhook
(`issued_documents.e_invoices.status_update`) carries the document id only.

## Frequent scarto codes (SDI Specifiche tecniche v1.9) and fix type

| Code | Description (short) | Fix type | Typical fix |
|---|---|---|---|
| 00300 | Supplier IdCodice not valid | fiscal | company settings; page the controller |
| 00305 | Client IdCodice (partita IVA) not valid | master_data | correct VAT number after VIES + client confirmation |
| 00306 | Client CodiceFiscale not valid | master_data | correct codice fiscale |
| 00311 / 00312 | CodiceDestinatario not valid / not active | master_data | ask client; use 0000000 + PEC meanwhile |
| 00313 | XXXXXXX used for an Italian client | master_data | real code or 0000000 |
| 00400 / 00401 | Natura missing at 0 % / present with rate > 0 | fiscal | change VAT type on the line |
| 00403 | Invoice date after receipt by SDI | fiscal | date must not be in the future |
| 00404 | Duplicate invoice | fiscal | check whether the first one was delivered; never resend blindly |
| 00411 | DatiRitenuta missing with Ritenuta SI | fiscal | add withholding data or remove the line flag |
| 00420 | Reverse charge with split payment | fiscal | remove one of the two |
| 00421 / 00423 | Imposta / PrezzoTotale not computed per rules | fiscal | recompute via totals endpoint |

## Clock

- The 5-day window starts at the `date` returned by `GET .../e_invoice/error_reason`.
- Day 4 without a successful resend, or a third scarto, pages the commercialista
  (renumbering in a sezionale such as `12/R`, linked to the rejected number).
- A scarto also means no bollo is due for that file (circolare 14/E/2019).
