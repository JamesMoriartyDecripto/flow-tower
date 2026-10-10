# Test and ship

- **Contract tests** (Pact): consumers state what they need, the provider proves it in CI.
- **Schema fuzzing** (Schemathesis): property-based requests generated from the OpenAPI or GraphQL schema find 500s and spec drift.
- **CI**: lint the spec, unit and contract tests, fuzzing against a throwaway database, dependency and secret scans.
- **Migrations before code**: run the *expand* step, deploy the code that uses both shapes, *contract* only after the old code is gone.
- **Canary**: a small share of traffic first; roll back on error rate or latency.

Sources: [Pact](https://docs.pact.io/) · [Schemathesis](https://pypi.org/project/schemathesis/) · [Parallel change](https://martinfowler.com/bliki/ParallelChange.html)
