---
id: levers-it
category: embeddings
endpoint: embeddings
check: json
steps: 1
---
# Find the right tax lever for an Italian client question

From real work: the ai-commercialista example maps client questions to the levers of config/levers-2026.yaml: Italian text, plain words in the question, technical words in the lever.

## Prompt

Embed the corpus and the queries (the runner ranks by cosine similarity).

## Request

```json
{
 "corpus": {
  "iperammortamento": "Maggiorazione del costo di acquisto dei beni strumentali nuovi 4.0 ai fini degli ammortamenti, per investimenti dal 2026 al 2028.",
  "forfettario": "Regime agevolato per persone fisiche con ricavi fino a 85.000 euro e imposta sostitutiva del 15 per cento, 5 per cento per i primi anni.",
  "cpb": "Accordo con l'Agenzia delle Entrate che fissa per due anni il reddito su cui si pagano le imposte, sulla base di una proposta.",
  "rottamazione": "Definizione agevolata dei debiti affidati all'agente della riscossione, senza sanzioni e interessi, in rate fino a nove anni.",
  "superdeduzione": "Deduzione maggiorata del costo dei nuovi assunti a tempo indeterminato, se crescono sia l'organico stabile sia quello totale.",
  "patent_box": "Maggiorazione dei costi di ricerca e sviluppo sostenuti per software protetto da copyright, brevetti e disegni.",
  "buoni_pasto": "Soglia di esenzione dei buoni pasto elettronici per i dipendenti, più alta di quella dei buoni cartacei.",
  "de_minimis": "Limite degli aiuti di Stato che un'impresa può ricevere in tre anni senza notifica alla Commissione europea."
 },
 "queries": {
  "q1": "Pago meno tasse se assumo personale stabile?",
  "q2": "Ho comprato un robot per la produzione: posso ammortizzarlo di più?",
  "q3": "Ho delle cartelle esattoriali vecchie, posso chiuderle pagando meno?",
  "q4": "Quanto posso ricevere in contributi pubblici senza superare il tetto europeo?",
  "q5": "Sono una libera professionista con pochi ricavi: c'è una tassa piatta?"
 }
}
```

## Expected

```json
{"q1": "superdeduzione", "q2": "iperammortamento", "q3": "rottamazione", "q4": "de_minimis", "q5": "forfettario"}
```
