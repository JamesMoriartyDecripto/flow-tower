---
id: shell-a
category: security
check: json
steps: 1
---
# Process execution review

Review only the supplied synthetic function. Threat model: `text` is arbitrary untrusted text. The POSIX shell interprets metacharacters in a command string; `/usr/bin/printf` accepts a fixed `%s` format that prints its following argument literally. No omitted code or functions are relevant.

## Prompt

Inline-code security review; use no tools. Return JSON only, shaped as `{"verdict":"approve"|"changes","findings":[{"severity":"high|medium|low","file":"...","line":1,"quote":"...","what":"...","why":"...","fix":"..."}]}`. Choose changes iff findings exist, otherwise approve with findings []. Quotes must be exact; line numbers count from first code line. Do not claim shell-safe argument passing is unsafe absent shell interpretation.

```js
// src/print.js
import { exec } from 'node:child_process';
export function print(text) {
  exec(`/usr/bin/printf '%s' '${text}'`);
}
```

## Expected

```json

{"verdict":"changes","findings":[{"severity":"high","file":"src/print.js","line":4,"quote":"exec(`/usr/bin/printf '%s' '${text}'`);","what":"Untrusted text is interpolated into a shell command string.","why":"The shell parses the interpolated text, so shell metacharacters can change the command rather than be printed as data.","fix":"Use execFile('/usr/bin/printf', ['%s', text]) so no shell parses the text and the format remains fixed."}]}
```
