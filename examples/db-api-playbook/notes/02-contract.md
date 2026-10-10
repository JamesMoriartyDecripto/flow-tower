# Design the contract

- **Resources first**: nouns in URLs (`/orders/{id}/items`), verbs are HTTP methods; never expose table internals you may want to change.
- **OpenAPI 3.2** (September 2025) is the source of truth: write it first, generate docs, clients and validators from it.
- **Errors**: Problem Details, RFC 9457 (obsoletes RFC 7807), `application/problem+json` with `type`, `title`, `status`, `detail`.
- **Pagination**: keyset / cursor (`?after=<cursor>`), not `OFFSET`: offset reads and discards rows and shifts pages when rows are inserted.
- **Idempotency**: an `Idempotency-Key` header on `POST` lets clients retry safely. It is a de-facto pattern (Stripe); the IETF draft expired without becoming an RFC.
- **Versioning**: a major in the URL (`/v1`) is the simplest; date-based versions pinned per client (Stripe) suit APIs that change often.
- **Lint** the spec in CI (Spectral, which supports OpenAPI 3.2).

Sources: [OpenAPI 3.2](https://spec.openapis.org/oas/v3.2) · [RFC 9457](https://www.rfc-editor.org/info/rfc9457) · [No offset](https://use-the-index-luke.com/no-offset) · [Idempotency-Key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) · [Stripe versioning](https://stripe.com/blog/api-versioning) · [Spectral](https://github.com/stoplightio/spectral/releases)
