# Database API Playbook

How to build and run an HTTP API over a database, as a tower: three decisions on top (who calls it, which style, generated or hand-written), then one layer per phase, and the life of a single request as a sub-tower. Every node opens a notes page with the current standards and options and links to their sources, checked on 2026-10-10.

```bash
node bin/flow-tower.js examples/db-api-playbook
```

## Layers

| Layer | What it holds |
|---|---|
| Choose the Approach | Callers; REST + OpenAPI, GraphQL or gRPC; generated (PostgREST, Supabase, Hasura DDN) or hand-written |
| Design the Contract | Resources, keyset pagination, Problem Details (RFC 9457), idempotency keys, versioning, OpenAPI 3.2, Spectral lint |
| Data Access | Schema and row-level security, expand / contract migrations, ORM or SQL, transactions, connection pooling, PostgreSQL 18 |
| Security & Access | OAuth 2 / OIDC (RFC 9700), scopes, secrets, OWASP API Security Top 10 (2023), API inventory |
| Test & Ship | Pact contract tests, Schemathesis fuzzing, CI, expand migration first, canary with rollback |
| Run & Evolve | Request pipeline (sub-tower), OpenTelemetry, SLOs, Deprecation (RFC 9745) and Sunset (RFC 8594), retirement |

`towers/request.tower.yaml` is one request in order: gateway, token, rate limit, validation, object authorization, idempotency, `If-Match` precondition, query, response; every check fails with its status code as Problem Details.

## Status of the standards (2026-10-10)

- Drafts, not RFCs: OAuth 2.1, the `RateLimit` header fields. The `Idempotency-Key` draft expired: the pattern is de facto (Stripe).
- `Sunset` (RFC 8594) is Informational; `Deprecation` (RFC 9745) is a Proposed Standard.
- PostgreSQL 19 is in beta (GA planned for late October 2026); the playbook uses 18, the current major.

## Sources

Each notes page lists its own. The main ones: [OWASP API Security](https://owasp.org/API-Security/), [OpenAPI 3.2](https://spec.openapis.org/oas/v3.2), [RFC 9457](https://www.rfc-editor.org/info/rfc9457), [RFC 9700](https://www.rfc-editor.org/info/rfc9700), [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [RFC 9745](https://www.rfc-editor.org/info/rfc9745), [PostgreSQL versioning](https://www.postgresql.org/support/versioning/), [OpenTelemetry database spans](https://opentelemetry.io/docs/specs/semconv/db/database-spans/).
