---
id: reviewer-b
category: reviewer
check: json
steps: 4
---
# Reviewer: clean path guard (control)

Synthetic pilot reviewer control. The excerpt is judged on its own content.

## Prompt

You are the reviewer role of the dev squad. Review the change below. Report only defects you can quote from the code shown.

File: `src/guard.mjs`

```js
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveInside(root, requested) {
  const base = resolve(root);
  const abs = resolve(base, requested);
  const rel = relative(base, abs);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('path escapes root');
  return abs;
}
```

Brief: `resolveInside` must return the absolute path under `root` and throw for any path that leaves it, including sibling folders that share a name prefix. The check is lexical: it looks only at the path strings.

Answer with JSON only, no prose around it:
{"verdict":"approve"|"changes","findings":[{"severity":"critical|high|medium|low","file":"path:line","quote":"exact line text","what":"...","why":"...","fix":"..."}]}

Use "changes" only when a real critical or high defect exists. This is a one-request review with no tools: return the JSON directly.

## Expected

```json
{"verdict":"approve","findings":[]}
```
