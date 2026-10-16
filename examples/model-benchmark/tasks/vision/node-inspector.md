---
id: node-inspector
category: vision
check: json
images: fixtures/node-inspector.png
steps: 1
---
# Read a node inspector panel

From real work: a Flow Tower screenshot with the inspector open on the `sources.sync` node of the ai-commercialista tower (2026-10-16).

## Prompt

Read the inspector panel on the right of the screenshot. Reply with one JSON object with exactly these keys and nothing else: `node` (the node title), `layer` (the value of the layer field), `cron` (the cron expression of the trigger, as shown), `timezone` (the time zone next to the cron), `subtower_file` (the value of the sub-tower field), `files` (the number on the Files tab).

## Expected

```json
{"node":"Source sync","layer":"sources","cron":"0 6 * * *","timezone":"Europe/Rome","subtower_file":"towers/sources.tower.yaml","files":2}
```
