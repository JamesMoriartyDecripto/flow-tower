---
id: credentials-b
category: security
check: json
steps: 1
---
# Test subprocess environment review

## Prompt

Review only environment forwarding in this synthetic test runner. The parent environment contains `OPENROUTER_API_KEY`; repository tests do not need it. Threat model excludes filesystem and OS-level attackers; no omitted code or functions are relevant. This is not a sandboxing review.

Inline-code security review; use no tools. Return JSON only, shaped as `{"verdict":"approve"|"changes","findings":[{"severity":"high|medium|low","file":"...","line":1,"quote":"...","what":"...","why":"...","fix":"..."}]}`. Choose changes iff findings exist, otherwise approve with findings []. Quotes must be exact; line numbers count from first code line. Do not expand the review to filesystem or OS attacks. Scope env API key forwarding only; PATH errors and filesystem attacks are out of scope.

```js
// scripts/run-tests.js
import { spawn } from 'node:child_process';
export function runTests() {
  return spawn(process.execPath, ['--test'], {
    env: { PATH: process.env.PATH, LANG: 'C' },
  });
}
```

## Expected

```json
{"verdict":"approve","findings":[]}
```
