---
id: credentials-a
category: security
check: json
steps: 1
---
# Test subprocess environment review

## Prompt

Review only environment forwarding in this synthetic test runner. The parent environment contains `OPENROUTER_API_KEY`; repository tests do not need it. Threat model excludes filesystem and OS-level attackers; no omitted code or functions are relevant. This is not a sandboxing review.

Inline-code security review; use no tools. Return JSON only, shaped as `{"verdict":"approve"|"changes","findings":[{"severity":"high|medium|low","file":"...","line":1,"quote":"...","what":"...","why":"...","fix":"..."}]}`. Choose changes iff findings exist, otherwise approve with findings []. Quotes must be exact; line numbers count from first code line. Limit findings to environment forwarding.

```js
// scripts/run-tests.js
import { spawn } from 'node:child_process';
export function runTests() {
  return spawn(process.execPath, ['--test'], { env: process.env });
}
```

## Expected

```json
{"verdict":"changes","findings":[{"severity":"high","file":"scripts/run-tests.js","line":4,"quote":"return spawn(process.execPath, ['--test'], { env: process.env });","what":"The subprocess inherits the entire parent environment, including OPENROUTER_API_KEY.","why":"Tests do not need this credential, so forwarding it exposes the API key to the child process unnecessarily.","fix":"Pass a minimal environment containing only required variables, such as PATH and LANG, and omit OPENROUTER_API_KEY."}]}
```
