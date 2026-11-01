---
id: doc-writer-b
category: doc-writer
check: regex
tools: read_file
files: templates/case-b/src/guard.mjs
steps: 5
---
# Doc writer: document the current guard and the intended behaviour

Synthetic pilot docs task for case B. The current behaviour differs from the intended behaviour.

## Prompt

You are the doc-writer role of the dev squad. The case directory is the repository root.

Read `src/guard.mjs` with read_file. Then write `docs/README.md` (the only file you may write, and it must be a Markdown file under `docs/`).

The document must have two clearly separate sections:

- **Current behaviour**: what `resolveInside` does today, with its actual result for `/srv/files` and the request `../files-private/key.pem`, quoted from the code.
- **Intended behaviour**: a segment-aware check that refuses sibling folders sharing the name prefix, `..` escapes and absolute paths outside the root, while keeping legitimate files under the root.

Do not describe the current code as if it already had the intended behaviour. Keep it short. End by calling finish with a one-line summary.

## Expected

The docs must state that today the guard uses a string prefix test, so `/srv/files-private` passes, and that it should refuse that sibling folder with an error mentioning `escapes`. Both sections must be present and must differ.

```regex
current
intended|should
startsWith|prefix
sibling|files-private
escapes
```

```must-not
already (refuses|rejects|blocks)
```
