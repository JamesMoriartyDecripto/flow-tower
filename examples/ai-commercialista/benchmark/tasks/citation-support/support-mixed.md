---
id: support-mixed
category: citation-support
check: json
steps: 1
---
# Judge six claims against cited AI and abuse-of-law text

From real work: `verify.support` in `ai-commercialista.tower.yaml`, checking that art. 13 L. 132/2025 (AI in professions) and art. 10-bis L. 212/2000 support the claims the drafter makes.

## Prompt

Each item is a claim and the source text cited for it. Answer `supported` only if the cited text states the claim; otherwise `not_supported` (the text says something different, says less, or does not say it). Judge only the cited text, not what you know. Reply with a JSON array of 6 strings and nothing else.

The cited texts are verbatim Italian law: art. 13 L. 132/2025 and art. 10-bis L. 212/2000.

1. Claim: "A professional may use AI only for instrumental and support activities." Cited, art. 13 comma 1: "L'utilizzo di sistemi di intelligenza artificiale nelle professioni intellettuali è finalizzato al solo esercizio delle attività strumentali e di supporto all'attività professionale e con prevalenza del lavoro intellettuale oggetto della prestazione d'opera."
2. Claim: "The professional must inform the client in writing about the AI systems used." Cited, art. 13 comma 2: "Per assicurare il rapporto fiduciario tra professionista e cliente, le informazioni relative ai sistemi di intelligenza artificiale utilizzati dal professionista sono comunicate al soggetto destinatario della prestazione intellettuale con linguaggio chiaro, semplice ed esaustivo."
3. Claim: "In the professional service, the professional's intellectual work must prevail." Cited, art. 13 comma 1: "L'utilizzo di sistemi di intelligenza artificiale nelle professioni intellettuali è finalizzato al solo esercizio delle attività strumentali e di supporto all'attività professionale e con prevalenza del lavoro intellettuale oggetto della prestazione d'opera."
4. Claim: "AI may replace the professional for routine filings." Cited, art. 13 comma 1: "L'utilizzo di sistemi di intelligenza artificiale nelle professioni intellettuali è finalizzato al solo esercizio delle attività strumentali e di supporto all'attività professionale e con prevalenza del lavoro intellettuale oggetto della prestazione d'opera."
5. Claim: "An abusive operation is void." Cited, art. 10-bis comma 1: "Configurano abuso del diritto una o più operazioni prive di sostanza economica che, pur nel rispetto formale delle norme fiscali, realizzano essenzialmente vantaggi fiscali indebiti. Tali operazioni non sono opponibili all'amministrazione finanziaria, che ne disconosce i vantaggi determinando i tributi sulla base delle norme e dei principi elusi e tenuto conto di quanto versato dal contribuente per effetto di dette operazioni."
6. Claim: "The tax authority disallows the advantages and computes the taxes under the circumvented rules, taking into account what the taxpayer paid." Cited, art. 10-bis comma 1: "Configurano abuso del diritto una o più operazioni prive di sostanza economica che, pur nel rispetto formale delle norme fiscali, realizzano essenzialmente vantaggi fiscali indebiti. Tali operazioni non sono opponibili all'amministrazione finanziaria, che ne disconosce i vantaggi determinando i tributi sulla base delle norme e dei principi elusi e tenuto conto di quanto versato dal contribuente per effetto di dette operazioni."

## Expected

```json
["supported","not_supported","supported","not_supported","not_supported","supported"]
```
