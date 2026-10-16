---
id: support-10bis
category: citation-support
check: json
steps: 1
---
# Judge six claims against cited art. 10-bis text

From real work: `verify.support` in `ai-commercialista.tower.yaml`, the second model that checks whether the cited text supports each claim (`prompts/support.md`).

## Prompt

Each item is a claim and the source text cited for it. Answer `supported` only if the cited text states the claim; otherwise `not_supported` (the text says something different, says less, or does not say it). Judge only the cited text, not what you know. Reply with a JSON array of 6 strings and nothing else.

The cited texts are from art. 10-bis of L. 212/2000 (Italian, verbatim).

1. Claim: "Choosing between optional regimes offered by the law is not abuse of law." Cited, comma 4: "Resta ferma la libertà di scelta del contribuente tra regimi opzionali diversi offerti dalla legge e tra operazioni comportanti un diverso carico fiscale."
2. Claim: "The taxpayer must prove that no abuse took place." Cited, comma 9: "L'amministrazione finanziaria ha l'onere di dimostrare la sussistenza della condotta abusiva, non rilevabile d'ufficio, in relazione agli elementi di cui ai commi 1 e 2. Il contribuente ha l'onere di dimostrare l'esistenza delle ragioni extrafiscali di cui al comma 3."
3. Claim: "Abusive operations are punished as tax crimes." Cited, comma 13: "Le operazioni abusive non danno luogo a fatti punibili ai sensi delle leggi penali tributarie. Resta ferma l'applicazione delle sanzioni amministrative tributarie."
4. Claim: "Operations justified by valid, non-marginal non-tax reasons, including organisational ones, are not abusive." Cited, comma 3: "Non si considerano abusive, in ogni caso, le operazioni giustificate da valide ragioni extrafiscali, non marginali, anche di ordine organizzativo o gestionale, che rispondono a finalità di miglioramento strutturale o funzionale dell'impresa ovvero dell'attività professionale del contribuente."
5. Claim: "The taxpayer can ask in advance, through an interpello, whether an operation is abusive." Cited, comma 5: "Il contribuente può proporre interpello ai sensi dell'articolo 11, comma 1, lettera c), per conoscere se le operazioni costituiscano fattispecie di abuso del diritto."
6. Claim: "Before assessing abuse, the tax authority must ask the taxpayer for clarifications and give 30 days to reply." Cited, comma 6: "Senza pregiudizio dell'ulteriore azione accertatrice nei termini stabiliti per i singoli tributi, l'abuso del diritto è accertato con apposito atto, preceduto, a pena di nullità, dalla notifica al contribuente di una richiesta di chiarimenti da fornire entro il termine di sessanta giorni, in cui sono indicati i motivi per i quali si ritiene configurabile un abuso del diritto."

## Expected

```json
["supported","not_supported","not_supported","supported","supported","not_supported"]
```
