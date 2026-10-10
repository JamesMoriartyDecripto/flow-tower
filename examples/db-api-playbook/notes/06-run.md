# Run and evolve

- **Telemetry**: OpenTelemetry traces with the stable HTTP and database semantic conventions (`http.route`, `db.system.name`, `db.query.summary`); opt in with `OTEL_SEMCONV_STABILITY_OPT_IN=database`.
- **SLOs**: error rate and latency per route; alerts on the burn rate, not on single errors.
- **Deprecation**: announce with the `Deprecation` header (RFC 9745), the removal date with `Sunset` (RFC 8594) and a `Link` to the migration guide; watch the traffic on the old version.
- **Retire** only when traffic has moved, then remove it from the inventory.

Sources: [OTel HTTP spans](https://opentelemetry.io/docs/specs/semconv/http/http-spans/) · [OTel database spans](https://opentelemetry.io/docs/specs/semconv/db/database-spans/) · [RFC 9745](https://www.rfc-editor.org/info/rfc9745) · [RFC 8594](https://www.rfc-editor.org/info/rfc8594)
