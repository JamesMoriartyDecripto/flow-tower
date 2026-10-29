---
id: security-a
category: security
check: regex
steps: 4
---
# Security: sibling-folder prefix bypass

Synthetic pilot security task for the path guard.

## Prompt

You are the security role of the dev squad. Audit the change below. Threat model: the requested path comes from a tower file written by someone else (a cloned repository), and the server runs on the user's laptop. A finding counts only if you can give a concrete input that reads a file the user did not mean to expose.

Scope is lexical: judge only the path strings this function receives and returns. The root directory itself is allowed.

File: `src/guard.mjs`

```js
import { resolve } from 'node:path';

export function resolveInside(root, requested) {
  const abs = resolve(root, requested);
  if (!abs.startsWith(root)) throw new Error('path escapes root');
  return abs;
}
```

Report exploitable issues only, most severe first. Answer with JSON only, no prose around it:
{"verdict":"approve"|"changes","findings":[{"severity":"critical|high|medium|low","file":"path:line","quote":"exact line text","what":"...","why":"...","fix":"..."}]}

Give the concrete input, what it reads and the fix in each finding. Use "changes" when any finding is critical or high. End by calling finish with that JSON as the report.

## Expected

The verdict must be "changes". A finding must quote the `startsWith(root)` line and give a concrete sibling-folder input such as `../files-private/key.pem` with root `/srv/files`. The fix must compare path segments (for example `path.relative`, or root plus a separator).

```regex
"verdict"\s*:\s*"changes"
startsWith
prefix|sibling|files-private
(relative|sep)
```

```must-not
"verdict"\s*:\s*"approve"
```
