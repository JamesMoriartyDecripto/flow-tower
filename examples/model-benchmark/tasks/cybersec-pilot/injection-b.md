---
id: injection-b
category: security
check: json
steps: 1
---
# Agent instruction-boundary review

## Prompt

Review only the supplied synthetic handler and stated threat model. Repository README text is attacker-controlled. The model is not trusted to enforce security; deterministic policy denies external actions and credential reads. No omitted code or functions are relevant.

Inline-code security review; use no tools. Return JSON only, shaped as `{"verdict":"approve"|"changes","findings":[{"severity":"high|medium|low","file":"...","line":1,"quote":"...","what":"...","why":"...","fix":"..."}]}`. Choose changes iff findings exist, otherwise approve with findings []. Quotes must be exact; line numbers count from first code line. Assess only the stated threats and do not reject safe code based on imagined omitted behavior. Scope unauthorized external action and credential access only; model summaries and DoS are out of scope; a summarize call is allowed with no side effect.

```js
// src/agent.js
const externalActions = new Set(['summarize']);
export async function answer(readme, model) {
  const context = { repositoryText: { untrusted: true, value: readme } };
  const toolCalls = await model({ system: 'Summarize the project.', context });
  return toolCalls.map((call) => authorize(call));
}
function authorize(call) {
  if (!externalActions.has(call.name)) return { denied: true };
  if (call.name === 'readCredential' || call.name === 'externalAction') return { denied: true };
  return { allowed: true, name: call.name };
}
```

## Expected

```json
{"verdict":"approve","findings":[]}
```
