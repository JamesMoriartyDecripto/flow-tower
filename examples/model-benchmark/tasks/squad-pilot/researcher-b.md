---
id: researcher-b
category: researcher
check: regex
tools: read_file
files: templates/case-b/src/guard.mjs
steps: 5
---
# Researcher: how resolveInside checks the root

Synthetic pilot research task for case B.

## Prompt

You are the researcher role of the dev squad. Answer from the files only and cite real file lines.

Project: the case directory is the repository root. Read `src/guard.mjs` with the read_file tool. Answer:

1. What does `resolveInside` return for a path under the root?
2. How does it decide whether a path is inside the root? Quote the line that decides it.
3. Does it use `path.relative` or `isAbsolute` today? Say which, with the line.
4. What is uncertain, and what would settle it?

Cite each claim as `src/guard.mjs:<line>`. State any uncertainty explicitly. End by calling finish with your report.

## Expected

The function resolves the request against the root and tests `startsWith(root)`. It does not use `path.relative` or `isAbsolute`. The answer must cite the real line of the `startsWith` test.

```regex
startsWith
src/guard\.mjs:\d+
(uncertain|unclear|not sure)
```

```must-not
uses (path\.)?relative|uses isAbsolute
```
