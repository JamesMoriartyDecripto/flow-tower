---
id: labels-b
category: abuse-label
check: json
steps: 1
---
# Label six harder proposals for abuse-of-law risk

From real work: `analysis.risk` in `ai-commercialista.tower.yaml`, the risk labeller that runs with `prompts/risk.md` and flags DAC6 cases.

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

1. A company chooses to hire an employee rather than engage a contractor for a real, ongoing role; the two options carry a different tax burden.
2. An SRL sells its head office to a bank and leases it back to fund an expansion; the deductions change, and the funding need is documented.
3. A sole trader splits the same activity into two forfettario positions, one in the spouse's name, with no real separation of the work, to stay under the revenue ceiling.
4. An Italian company sets up a Luxembourg holding with no staff and no activity only to receive dividends from its Italian subsidiary at a lower withholding.
5. A company opts for the patent box regime for software it develops in-house, with documented R&D cost tracking.
6. A company pays its employees productivity bonuses under a second-level agreement with incremental targets, taxed at the reduced substitute tax.

## Expected

```json
[{"label":"green","dac6":false},{"label":"amber","dac6":false},{"label":"red","dac6":false},{"label":"red","dac6":true},{"label":"green","dac6":false},{"label":"green","dac6":false}]
```
