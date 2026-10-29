---
id: shell-b
category: security
check: json
steps: 1
---
# Process execution review

Review only the supplied synthetic function. Threat model: `text` is arbitrary untrusted text. The POSIX shell interprets metacharacters in a command string; `/usr/bin/printf` accepts a fixed `%s` format that prints its following argument literally. No omitted code or functions are relevant.

## Prompt

Inline-code security review; use no tools. Return JSON only, shaped as `{"verdict":"approve"|"changes","findings":[{"severity":"high|medium|low","file":"...","line":1,"quote":"...","what":"...","why":"...","fix":"..."}]}`. Choose changes iff findings exist, otherwise approve with findings []. Quotes must be exact; line numbers count from first code line. Do not invent option injection for the fixed `%s` format and argument semantics.

```js
// src/print.js
import { execFile } from 'node:child_process';
export function print(text) {
  execFile('/usr/bin/printf', ['%s', text]);
}
```

## Expected

```json
{"verdict":"approve","findings":[]}
```
