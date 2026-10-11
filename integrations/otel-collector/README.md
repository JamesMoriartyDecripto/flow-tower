# OTel Collector (per host)

`collector.yaml` runs one [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) (contrib distribution) per machine. Agents send to it on `127.0.0.1:4318`; it adds host, cloud and user tags (`resourcedetection`, `resource`), deletes prompt and tool-input fields (`transform`), and forwards OTLP/HTTP JSON to Flow Tower. A file-backed queue in `~/.flow-tower/otel-queue` keeps data while the laptop is offline. Remote hubs: #83.

## Run

Environment: `FLOW_TOWER_URL` (default `http://127.0.0.1:5317`), `FLOW_TOWER_TOKEN` (if the server sets one), `FT_USER`, `FT_ENV`.

```sh
otelcol-contrib --config integrations/otel-collector/collector.yaml
# or
docker run --rm -p 127.0.0.1:4318:4318 -e FLOW_TOWER_URL=http://host.docker.internal:5317 \
  -e FT_USER=alice -e FT_ENV=dev -e FLOW_TOWER_TOKEN -e HOME=/home \
  -v "$PWD/integrations/otel-collector:/cfg" -v "$HOME/.flow-tower:/home/.flow-tower" \
  otel/opentelemetry-collector-contrib:latest --config=/cfg/collector.yaml
```

In Docker the receivers must listen on `0.0.0.0` (edit the two `endpoint`s) for the port mapping to reach them.

## Point the agents at it

User-level only (project settings are ignored for telemetry):

- **Claude Code** (`~/.claude/settings.json` `env`, managed settings or shell): `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`.
- **Codex** (`~/.codex/config.toml`): `[otel]` with `exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }`.

The exporter compresses with gzip, which Flow Tower accepts; add `compression: none` to `otlp_http/flowtower` to send plain JSON.
