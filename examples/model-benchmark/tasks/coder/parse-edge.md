---
id: parse-edge
category: coder
check: command
command: parse-edge.check.mjs
steps: 4
---
# Parse the edge shorthand

From real work: `src/core/edges.ts` in Flow Tower parses edges written as one string in a tower file.

## Prompt

Write a JavaScript ES module that exports a function `parseEdge(text)`.

Tower files write an edge as one string: `from -> to`, optionally followed by a kind in square brackets and a label after a colon:

- `"a -> b"`
- `"a -> b: label"`
- `"a -> b [spawn]"`
- `"a -> b [spawn]: label"`

Rules:

- Node ids contain letters, digits, `_`, `.` and `-` (`layer.node` addresses a node in another layer).
- Whitespace around the parts is ignored.
- The kind defaults to `flow`. Valid kinds: `flow`, `call`, `spawn`, `handoff`, `return`, `data`.
- The label is everything after the first colon that follows the target or the kind, trimmed; it may itself contain colons.
- Return `{ from, to, kind, label }` (omit `label` or set it to `undefined` when there is none).
- Return an error **string** (not a throw) when the text does not match, or when the kind is not one of the valid ones; the message must contain the bad text.

Reply with the complete module in one ```js code block and nothing else.

## Expected

`parse-edge.check.mjs` imports the module and checks 9 cases: the four forms above, dotted ids, a label with colons (`"a -> b: x: y"` gives `"x: y"`), extra whitespace, an unknown kind (`[jump]`, a string containing `jump`) and a malformed edge (`"a b"`, a string).
