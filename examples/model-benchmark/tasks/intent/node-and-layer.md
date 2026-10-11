---
id: node-and-layer
category: intent
check: json
steps: 1
---
# Resolve nodes and layers by name

From real work: the voice widget resolves spoken names against the open tower (`layerCandidates` and `nodeCandidates` in `src/app/voice/commands.ts`), here on the dev-squad example.

## Prompt

You turn spoken commands for a 3D tower viewer into actions. The open tower is `dev-squad`. Its layers, top to bottom (index from 0), and some of their nodes (`layer.node` key: label):

- 0 `intake` Intake: `intake.issue` GitHub issue, `intake.triage` Triage
- 1 `orchestration` Orchestration: `orchestration.lead` Lead
- 2 `specialists` Specialists: `specialists.coder` Coder, `specialists.researcher` Researcher
- 3 `quality` Quality Loop: `quality.reviewer` Reviewer, `quality.security` Security auditor, `quality.verifier` Verifier
- 4 `memory` Memory & Context

Actions:

- `{"kind":"layer","index":N}` show a layer; spoken numbers count from one ("the first layer" is index 0)
- `{"kind":"node","tower":"dev-squad","key":"<layer.node>"}` select a node
- `{"kind":"ambiguous","keys":["<layer.node>", ...]}` the name fits several nodes equally well (keys sorted alphabetically)
- `{"kind":"unknown"}` nothing fits

Classify each utterance, in order. Reply with a JSON array of 5 actions and nothing else.

1. "open the reviewer"
2. "go to the quality loop"
3. "layer three"
4. "show the security auditor"
5. "open the deploy step"

## Expected

"layer three" is index 2 (spoken numbers count from one, as the prompt says). "deploy" matches no node: unknown, not a guess.

```json
[{"kind":"node","tower":"dev-squad","key":"quality.reviewer"},{"kind":"layer","index":3},{"kind":"layer","index":2},{"kind":"node","tower":"dev-squad","key":"quality.security"},{"kind":"unknown"}]
```
