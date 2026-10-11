# Team Hub

The architecture of Flow Tower's own team hub (#59), dogfooded on this repo: `root: ../..`, so every node opens the real source file.

Layers, bottom to top of the request path:

1. **Senders**: hooks via `flow-tower emit` (identity and config file), the OTel collector, satellites: `flow-tower connect` writes a satellite config, a metadata-only relay forwards accepted events and one heartbeat a minute, `GET /api/sharing` reports the relay's own state.
2. **Guard**: `hubGuard` (remote may only ingest; viewer header trusted only from loopback; files, voice and `/@fs` always 403 remote; WebSocket upgrades gated), `authorize`, hashed per-sender tokens, exposure recipes.
3. **Ingest**: `/api/events`, `/v1/*` OTLP and `POST /api/heartbeat` (a satellite's relay state; a token is required in hub mode), gzip/deflate with a size cap, 415 on unknown encodings, token bucket, dedupe, ±24 h window, adapters.
4. **Identity**: the user / host / runtime / project / session cascade.
5. **Storage**: SQLite via `node:sqlite`, hourly and daily rollups, retention 14 days raw (1-21), 90 days hourly, 13 months daily.
6. **Config**: `config.json`, git-ignored `flow-tower.local.json`, flags > non-empty env > config, `hub.json` migration; the config token is the sender's credential, never the server's own secret (`FLOW_TOWER_TOKEN` or per-sender tokens).
7. **Views**: the live tower and the in-memory satellite list (`GET /api/hub/satellites`: last seen, last event, queue counters, online); planned (dashed, `status: planned`): hub panel #92, privacy profiles #85, admin #93, alerts #94.

## Sources

- Issue #59 (team hub) and its follow-ups #85, #91, #92, #93, #94.
- `bin/flow-tower.js`, `bin/identity.js`, `bin/config-file.js`
- `src/server/hub.ts`, `auth.ts`, `tokens.ts`, `events.ts`, `limits.ts`, `config.ts`, `relay.ts`, `satellites.ts`, `plugin.ts`, `history/*`
- `src/core/otlp.ts`, `adapters.ts`, `identity.ts`; `src/cli/token.ts`, `history.ts`, `config.ts`, `connect.ts`
- `integrations/hub/*`, `integrations/otel-collector/collector.yaml`
