---
id: gotcha-en
category: rerank
endpoint: rerank
check: json
steps: 1
---
# Put the right gotcha first

From real work: the Gotchas of the Flow Tower CLAUDE.md, retrieved when an agent hits a problem.

## Prompt

Rerank the documents for the query.

## Request

```json
{
 "query": "I changed src/server/hub.ts but the running server still behaves the old way. Why?",
 "documents": [
  "The hub keeps a history of events per user in SQLite; history export prints JSONL.",
  "Claude Code HTTP hooks must get 204 with an empty body: a JSON body is read as the hook's decision.",
  "The tooltip measures itself and stays inside the window.",
  "An empty environment variable counts as unset, so it never overrides the config file.",
  "Rendering is batched per layer with instanced meshes; per-node meshes dropped the frame rate to 14 FPS.",
  "The library card titles wrap up to three lines.",
  "The CLI server loads vite.config.ts once, so editing server code needs a manual restart.",
  "Each server port has its own Vite cache folder."
 ],
 "top_n": 1
}
```

## Expected

```json
[6]
```
