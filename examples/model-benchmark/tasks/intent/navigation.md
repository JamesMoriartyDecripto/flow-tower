---
id: navigation
category: intent
check: json
steps: 1
---
# Classify navigation commands

From real work: the voice widget's command parser (`src/app/voice/commands.ts`, the `VoiceAction` type) in Flow Tower.

## Prompt

You turn spoken commands for a 3D tower viewer into actions. The possible actions are exactly these JSON objects:

- `{"kind":"library"}` go to the list of towers
- `{"kind":"layer","index":N}` show layer N, counted from 0 at the top
- `{"kind":"view","view":"map"}` or `{"kind":"view","view":"tower"}` switch the view
- `{"kind":"overview"}` show the whole tower
- `{"kind":"back"}` go back one level
- `{"kind":"enter"}` open the sub-tower of the selected node
- `{"kind":"close"}` close the inspector panel
- `{"kind":"mic-off"}` stop listening
- `{"kind":"unknown"}` anything else

Classify each utterance, in order. Reply with a JSON array of 6 actions and nothing else.

1. "turn off the microphone"
2. "go back"
3. "show me the whole tower"
4. "open the sub tower"
5. "switch to the map view"
6. "what's the weather like tomorrow"

## Expected

```json
[{"kind":"mic-off"},{"kind":"back"},{"kind":"overview"},{"kind":"enter"},{"kind":"view","view":"map"},{"kind":"unknown"}]
```
