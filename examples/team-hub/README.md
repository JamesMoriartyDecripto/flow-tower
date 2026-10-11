# Team Hub

The architecture of Flow Tower's own team hub (#59), dogfooded on this repo: `root: ../..`, so every node opens the real source file.

Layers, bottom to top of the request path:

1. **Senders**: hooks via `flow-tower emit` (identity and config file), the OTel collector, satellites (planned, #91).
2. **Guard**: `hubGuard` (remote may only ingest; viewer header trusted only from loopback; files, voice and `/@fs` always 403 remote; WebSocket upgrades gated), `authorize`, hashed per-sender tokens, exposure recipes.
3. **Ingest**: `/api/events` and `/v1/*` OTLP, gzip/deflate with a size cap, 415 on unknown encodings, token bucket, dedupe, ±24 h window, adapters.
4. **Identity**: the user / host / runtime / project / session cascade.
5. **Storage**: SQLite via `node:sqlite`, hourly and daily rollups, retention 14 days raw (1-21), 90 days hourly, 13 months daily.
6. **Config**: `config.json`, git-ignored `flow-tower.local.json`, flags > env > config, `hub.json` migration.
7. **Views**: the live tower; planned (dashed, `status: planned`): hub panel #92, privacy profiles #85, admin #93, alerts #94.

## Sources

- Issue #59 (team hub) and its follow-ups #85, #91, #92, #93, #94.
- `bin/flow-tower.js`, `bin/identity.js`, `bin/config-file.js`
- `src/server/hub.ts`, `auth.ts`, `tokens.ts`, `events.ts`, `limits.ts`, `config.ts`, `history/*`
- `src/core/otlp.ts`, `adapters.ts`, `identity.ts`; `src/cli/token.ts`, `history.ts`, `config.ts`
- `integrations/hub/*`, `integrations/otel-collector/collector.yaml`
