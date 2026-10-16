---
id: tower-overview
category: vision
check: json
images: fixtures/tower-overview.png
steps: 1
---
# Read a tower screenshot

From real work: a Flow Tower screenshot of the ai-commercialista tower (scratch server, 2026-10-16), the kind of image a UI check or a support agent reads.

## Prompt

Read the screenshot of the 3D tower viewer. Reply with one JSON object with exactly these keys and nothing else: `tower` (the tower name in the top bar), `layers` (how many layers the LAYERS panel lists, not counting "Tower overview"), `yaml_errors` (the number on the YAML ERR badge), `budget_per_month_usd` (the number in the model budget line under LAYERS), `subtower` (the name of the one sub-tower listed), `nodes_in_l04` (the node count shown at the right of the L04 row).

## Expected

```json
{"tower":"AI Commercialista (Italy)","layers":7,"yaml_errors":0,"budget_per_month_usd":400,"subtower":"Source sync","nodes_in_l04":5}
```
