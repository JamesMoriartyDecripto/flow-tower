---
id: abuso-it
category: rerank
endpoint: rerank
check: json
steps: 1
---
# Put the right rule first, in Italian

From real work: the ai-commercialista example retrieves the comma of art. 10-bis that answers a client question before the researcher cites it.

## Prompt

Rerank the documents for the query.

## Request

```json
{
 "query": "Se scelgo il forfettario perché pago meno tasse, l'Agenzia può dire che è elusione?",
 "documents": [
  "Il regime forfettario prevede un'imposta sostitutiva del 15 per cento.",
  "La rottamazione-quinquies riguarda i debiti affidati alla riscossione dal 2000 al 2023.",
  "L'iperammortamento si applica ai beni nuovi 4.0 acquistati dal 2026 al 2028.",
  "L'abuso del diritto non è punibile penalmente, ma restano le sanzioni amministrative.",
  "Il contribuente può presentare interpello per sapere se un'operazione è abusiva.",
  "La libertà di scelta tra regimi opzionali offerti dalla legge non costituisce abuso.",
  "Il concordato preventivo biennale si aderisce entro il termine della dichiarazione."
 ],
 "top_n": 1
}
```

## Expected

```json
[5]
```
