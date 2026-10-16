---
id: labels-a
category: abuse-label
check: json
steps: 1
---
# Label six proposals for abuse-of-law risk

From real work: `analysis.risk` in `ai-commercialista.tower.yaml`, which labels each proposal with `prompts/risk.md` before the drafter runs.

## Prompt

You label one proposal for abuse-of-law risk under art. 10-bis L. 212/2000 and flag DAC6 where it may apply. You label; you never approve a proposal. Judge the proposal's legal form and purpose, not its tax result alone.

Labels:

- `green`: a choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).
- `amber`: a tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).
- `red`: a tax advantage that is the essential purpose of operations without economic substance (art. 10-bis c. 1-2).

`dac6` is true only for a cross-border element where a DAC6 hallmark could apply, and false for a purely domestic operation.

The text of art. 10-bis, commi 1-4, L. 212/2000 (Italian, the source):

1. Configurano abuso del diritto una o più operazioni prive di sostanza economica che, pur nel rispetto formale delle norme fiscali, realizzano essenzialmente vantaggi fiscali indebiti. Tali operazioni non sono opponibili all'amministrazione finanziaria, che ne disconosce i vantaggi determinando i tributi sulla base delle norme e dei principi elusi e tenuto conto di quanto versato dal contribuente per effetto di dette operazioni.
2. Ai fini del comma 1 si considerano: a) operazioni prive di sostanza economica i fatti, gli atti e i contratti, anche tra loro collegati, inidonei a produrre effetti significativi diversi dai vantaggi fiscali. Sono indici di mancanza di sostanza economica, in particolare, la non coerenza della qualificazione delle singole operazioni con il fondamento giuridico del loro insieme e la non conformità dell'utilizzo degli strumenti giuridici a normali logiche di mercato; b) vantaggi fiscali indebiti i benefici, anche non immediati, realizzati in contrasto con le finalità delle norme fiscali o con i principi dell'ordinamento tributario.
3. Non si considerano abusive, in ogni caso, le operazioni giustificate da valide ragioni extrafiscali, non marginali, anche di ordine organizzativo o gestionale, che rispondono a finalità di miglioramento strutturale o funzionale dell'impresa ovvero dell'attività professionale del contribuente.
4. Resta ferma la libertà di scelta del contribuente tra regimi opzionali diversi offerti dalla legge e tra operazioni comportanti un diverso carico fiscale.

Label each proposal, in order. Reply with a JSON array of 6 objects `{"label": …, "dac6": …}` and nothing else.

1. A freelance designer who meets the conditions stays in the forfettario regime instead of the ordinary regime.
2. An SRL adheres to the concordato preventivo biennale 2026-2027.
3. An SRL buys a machine it needs for production and claims the iperammortamento on it.
4. Two shareholders set up three companies that sell the same building to each other within one month; nothing else changes, and the only effect is a higher tax basis for depreciation.
5. An Italian software company moves its software IP to a newly formed Irish subsidiary with no staff and licenses it back.
6. Two group companies merge to unify management and cut duplicate costs, which also lets the merged company use past losses; the board minutes document the organisational reasons.

## Expected

```json
[{"label":"green","dac6":false},{"label":"green","dac6":false},{"label":"green","dac6":false},{"label":"red","dac6":false},{"label":"red","dac6":true},{"label":"amber","dac6":false}]
```
