---
id: shell-path
category: coder
check: command
command: shell-path.check.mjs
steps: 4
---
# Quote a path for a copy-paste shell hint

From real work: Flow Tower's `bin/cli-name.js` (`shellQuote`, `shellPath`, #193): the CLI prints commands people paste into a POSIX shell, and a checkout path with a space or a quote broke them.

## Prompt

Write a JavaScript ES module that exports two functions.

- `shellQuote(value)`: returns `value` as ONE POSIX shell word in single quotes. A single quote inside the value is written as `'\''` (close the quote, an escaped quote, reopen). Example: `it's` gives `'it'\''s'`; the empty string gives `''`.
- `shellPath(path)`: returns the path unchanged when every character is in the safe set `A-Z a-z 0-9 _ @ % + = : , . / -`; otherwise returns `shellQuote(path)`. The empty string is not safe (it would vanish as a word), so it gives `''`.

Reply with the complete module in one ```js code block and nothing else.

## Expected

`shell-path.check.mjs` checks plain paths left as they are, paths with a space, `$`, `"`, a backtick, a newline, a single quote and several single quotes, a leading `-`, a non-ASCII letter, and the empty string.
