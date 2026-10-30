---
id: researcher-a
category: researcher
check: regex
tools: read_file
files: templates/case-a/src/price.mjs
steps: 5
---
# Researcher: where and how formatPrice behaves

Synthetic pilot research task for case A.

## Prompt

You are the researcher role of the dev squad. Answer from the files only and cite real file lines.

Project: the case directory is the repository root. Read `src/price.mjs` with the read_file tool. Answer:

1. Which function is exported, and what does it return for a finite number?
2. What does it do for `NaN`, `Infinity` and a string such as `"12.5"`? Quote the lines that decide this.
3. What is uncertain, and what would settle it?

Cite each claim as `src/price.mjs:<line>`. State any uncertainty explicitly. End by calling finish with your report.

## Expected

The module exports `formatPrice`, which returns `Number(value).toFixed(2)`. It does not throw for `NaN`, `Infinity` or strings: it returns a string. The answer must cite the real line of the return statement.

```regex
formatPrice
toFixed
src/price\.mjs:\d+
(uncertain|unclear|not sure)
```

```must-not
throws (a )?TypeError
```
