---
id: doc-writer-a
category: doc-writer
check: regex
tools: read_file
files: templates/case-a/src/price.mjs
steps: 5
---
# Doc writer: document the current formatter and the intended behaviour

Synthetic pilot docs task for case A. The current behaviour differs from the intended behaviour.

## Prompt

You are the doc-writer role of the dev squad. The case directory is the repository root.

Read `src/price.mjs` with read_file. Then write `docs/README.md` (the only file you may write, and it must be a Markdown file under `docs/`).

The document must have two clearly separate sections:

- **Current behaviour**: what the code does today, with the actual result for `NaN`, `Infinity` and `"12.5"`, quoted from the code.
- **Intended behaviour**: what the formatter should do, namely reject non-finite numbers and strings with a TypeError and format finite numbers with toFixed(2).

Do not describe the current code as if it already had the intended behaviour. Keep it short. End by calling finish with a one-line summary.

## Expected

The docs must state that today the formatter returns a string for NaN, Infinity and strings, and that it should throw a TypeError instead. Both sections must be present and must differ.

```regex
current
intended|should
toFixed
TypeError
(NaN|Infinity|string)
```

```must-not
already (throws|rejects)
```
