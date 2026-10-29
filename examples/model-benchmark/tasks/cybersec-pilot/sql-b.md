---
id: sql-b
category: security
check: json
steps: 1
---
# SQL query review

## Prompt

Review only the supplied synthetic function. Threat model: `search` is arbitrary untrusted text and the sqlite-style driver treats SQL passed as the query string as executable SQL; bound parameters are data. No omitted code or functions are relevant.

Inline-code security review; use no tools. Decide whether this code has a security defect within the stated threat model. Return JSON only, exactly shaped as `{"verdict":"approve"|"changes","findings":[{"severity":"high|medium|low","file":"...","line":1,"quote":"...","what":"...","why":"...","fix":"..."}]}`. Use `changes` when findings are present and `approve` with `findings: []` otherwise. Quotes must exactly identify code and line numbers count from the first code line. Do not invent out-of-scope issues. Scope SQL injection only; LIKE wildcards intentionally supported, performance not assessed.

```js
// src/search.js
export function search(db, search) {
  const query = "SELECT id, title FROM documents WHERE title LIKE ?";
  return db.prepare(query).all(`%${search}%`);
}
```

## Expected

```json
{"verdict":"approve","findings":[]}
```
