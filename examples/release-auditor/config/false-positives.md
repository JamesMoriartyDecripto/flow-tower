# False-positive rules

Read by the verifier before judging a finding. A finding that matches a rule is rejected with the rule number,
unless it shows a concrete path around the precedent.

1. **Local-only server.** The dev server binds to 127.0.0.1 for the user's own towers. "No authentication" is not a finding by itself; a way for a web page or another user to read files or crash the server is.
2. **Dev-only hooks.** `window.__flowTower` exists only in development (`import.meta.env.DEV`); it is not shipped in a production build.
3. **Illustrative example data.** Numbers, budgets, eval values and ids in `examples/` are labelled illustrative; placeholders that look like keys (`sk-...-example`) are not secrets.
4. **Upstream deprecations.** Warnings raised inside three.js / r3f / drei (e.g. `THREE.Clock` deprecated) are tracked upstream, not bugs here, unless our code calls the deprecated API.
5. **Semgrep on examples.** Sample code in `examples/**/src` illustrates other people's systems; flag it only if it would mislead a reader into an insecure pattern.
6. **Style and taste.** Naming, formatting, "could be simpler" without a behavior difference: out of scope (charters.md).
