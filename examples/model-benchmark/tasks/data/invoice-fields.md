---
id: invoice-fields
category: data
check: json
steps: 1
---
# Extract the fields of an Italian invoice

From real work: the invoicing-fic example (passive cycle): a received invoice becomes a record the accountant export reads. The invoice is fictional (placeholder VAT numbers).

## Prompt

Extract the fields of this invoice into one JSON object with exactly these keys: `number` (string), `date` (YYYY-MM-DD), `supplier_vat` (string, as written, without spaces), `customer_vat` (string, as written, without spaces), `net` (number), `vat_rate` (number, percent), `vat` (number), `total` (number), `due_date` (YYYY-MM-DD), `payment` (one of `bonifico`, `riba`, `contanti`, `carta`). Use a dot as the decimal separator. Reply with the JSON object and nothing else.

```
FATTURA N. 2026/0418 del 14 ottobre 2026
Cedente: Officine Example S.r.l. – P.IVA IT 00000000001 – Via Example 1, Padova
Cessionario: Lumen Grid S.r.l. – P.IVA IT00000000000
Descrizione: manutenzione inverter impianto FV 120 kW (ottobre 2026)
Imponibile € 1.250,00
IVA 22% € 275,00
Totale documento € 1.525,00
Pagamento: bonifico bancario a 30 gg data fattura (scadenza 13/11/2026)
```

## Expected

```json
{"number":"2026/0418","date":"2026-10-14","supplier_vat":"IT00000000001","customer_vat":"IT00000000000","net":1250,"vat_rate":22,"vat":275,"total":1525,"due_date":"2026-11-13","payment":"bonifico"}
```
