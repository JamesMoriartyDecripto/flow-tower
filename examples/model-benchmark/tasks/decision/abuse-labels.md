---
id: abuse-labels
category: decision
endpoint: decisions
check: json
steps: 1
---
# Label six proposals for abuse-of-law risk (Decisions API)

From real work: `analysis.risk` of the ai-commercialista example; the same six proposals as its chat task `labels-a`.

## Prompt

Label each proposal of the state (the questions carry the labels and their definitions).

## Request

```json
{
 "state": {
  "context": "Label each proposal for an Italian company under art. 10-bis L. 212/2000.",
  "proposal1": "A freelance designer who meets the conditions stays in the forfettario regime instead of the ordinary regime.",
  "proposal2": "An SRL adheres to the concordato preventivo biennale 2026-2027.",
  "proposal3": "An SRL buys a machine it needs for production and claims the iperammortamento on it.",
  "proposal4": "Two shareholders set up three companies that sell the same building to each other within one month; nothing else changes, and the only effect is a higher tax basis for depreciation.",
  "proposal5": "An Italian software company moves its software IP to a newly formed Irish subsidiary with no staff and licenses it back.",
  "proposal6": "Two group companies merge to unify management and cut duplicate costs, which also lets the merged company use past losses; the board minutes document the organisational reasons."
 },
 "questions": {
  "label1": {
   "type": "choice",
   "instructions": "Abuse-of-law risk label of `proposal1`.",
   "criteria": {
    "green": "A choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).",
    "amber": "A tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).",
    "red": "The tax advantage is the essential purpose of operations without economic substance (art. 10-bis c. 1-2)."
   }
  },
  "dac6_1": {
   "type": "noul",
   "instructions": "`proposal1` has a cross-border element where a DAC6 hallmark could apply (a purely domestic operation is false)."
  },
  "label2": {
   "type": "choice",
   "instructions": "Abuse-of-law risk label of `proposal2`.",
   "criteria": {
    "green": "A choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).",
    "amber": "A tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).",
    "red": "The tax advantage is the essential purpose of operations without economic substance (art. 10-bis c. 1-2)."
   }
  },
  "dac6_2": {
   "type": "noul",
   "instructions": "`proposal2` has a cross-border element where a DAC6 hallmark could apply (a purely domestic operation is false)."
  },
  "label3": {
   "type": "choice",
   "instructions": "Abuse-of-law risk label of `proposal3`.",
   "criteria": {
    "green": "A choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).",
    "amber": "A tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).",
    "red": "The tax advantage is the essential purpose of operations without economic substance (art. 10-bis c. 1-2)."
   }
  },
  "dac6_3": {
   "type": "noul",
   "instructions": "`proposal3` has a cross-border element where a DAC6 hallmark could apply (a purely domestic operation is false)."
  },
  "label4": {
   "type": "choice",
   "instructions": "Abuse-of-law risk label of `proposal4`.",
   "criteria": {
    "green": "A choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).",
    "amber": "A tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).",
    "red": "The tax advantage is the essential purpose of operations without economic substance (art. 10-bis c. 1-2)."
   }
  },
  "dac6_4": {
   "type": "noul",
   "instructions": "`proposal4` has a cross-border element where a DAC6 hallmark could apply (a purely domestic operation is false)."
  },
  "label5": {
   "type": "choice",
   "instructions": "Abuse-of-law risk label of `proposal5`.",
   "criteria": {
    "green": "A choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).",
    "amber": "A tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).",
    "red": "The tax advantage is the essential purpose of operations without economic substance (art. 10-bis c. 1-2)."
   }
  },
  "dac6_5": {
   "type": "noul",
   "instructions": "`proposal5` has a cross-border element where a DAC6 hallmark could apply (a purely domestic operation is false)."
  },
  "label6": {
   "type": "choice",
   "instructions": "Abuse-of-law risk label of `proposal6`.",
   "criteria": {
    "green": "A choice between regimes or options expressly offered by law, or between operations with a different tax burden (art. 10-bis c. 4).",
    "amber": "A tax advantage that needs documented non-tax reasons (art. 10-bis c. 3).",
    "red": "The tax advantage is the essential purpose of operations without economic substance (art. 10-bis c. 1-2)."
   }
  },
  "dac6_6": {
   "type": "noul",
   "instructions": "`proposal6` has a cross-border element where a DAC6 hallmark could apply (a purely domestic operation is false)."
  }
 }
}
```

## Expected

```json
{"label1": "green", "dac6_1": false, "label2": "green", "dac6_2": false, "label3": "green", "dac6_3": false, "label4": "red", "dac6_4": false, "label5": "red", "dac6_5": true, "label6": "amber", "dac6_6": false}
```
