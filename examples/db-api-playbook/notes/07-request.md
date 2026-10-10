# One request, step by step

1. **Gateway**: TLS, request size limit, CORS.
2. **Verify the token**: signature, issuer, audience, expiry, scopes. Fails with `401`.
3. **Rate limit**: per client and per route. Fails with `429` and `Retry-After`; the `RateLimit` / `RateLimit-Policy` headers are still an IETF draft.
4. **Validate** the body and parameters against the OpenAPI schema. Fails with `400` or `422`.
5. **Object authorization**: may *this* caller read or change *this* object (and these fields)? Fails with `403`, or `404` to hide that it exists.
6. **Idempotency key** seen before? Return the stored response instead of writing twice.
7. **Precondition**: `If-Match` with the ETag the client read; a mismatch means someone else changed it: `412` (RFC 9110). Optimistic locking without locks.
8. **Query** through the pool, keyset pagination for lists.
9. **Response** with `ETag` and `Cache-Control`; every error as `application/problem+json`.

Sources: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) (ETag §8.8.3, If-Match §13.1.1, 412 §15.5.13) · [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html) · [RateLimit headers draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) · [RFC 9457](https://www.rfc-editor.org/info/rfc9457)
