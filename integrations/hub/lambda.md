# AWS Lambda

Lambda has no loopback and a read-only `/tmp`, and a Flow Tower hub must run somewhere always-on (a
small VPS, a home box, or a Lambda that only ingests). Two shapes work.

## OTel Collector layer (recommended)

Run the collector as a Lambda layer and let it own the tailnet with Tailscale's userspace networking
(https://tailscale.com/kb/1113/aws-lambda). Build the layer from the collector binary plus the
Tailscale userspace binary, and join the tailnet as an ephemeral `tag:ci` / `tag:flow-sender` node with
a state file under `/tmp`. The collector then forwards OTLP to your hub:

```yaml
# Collector config on Lambda: keep the file queue small (ephemeral disk) and forward to the hub.
exporters:
  otlp_http/flowtower:
    endpoint: https://hub.tailnet-xyz.ts.net
    encoding: json
    headers:
      x-flow-tower-token: ${env:FLOW_TOWER_TOKEN}
```

The layer's environment carries `FLOW_TOWER_TOKEN` (a per-sender token, `flow-tower token add lambda`)
and the ACL grants `tag:flow-sender` -> `tag:flow-hub:443` (`acl.hujson`). Prompts never leave the
function: the same transform in `integrations/otel-collector/collector.yaml` strips them.

## Direct OTLP/HTTP to a public ingest-only endpoint

Simplest, no tailnet. Run a hub with `flow-tower --ingest-only` behind Caddy or Cloudflare Tunnel
(`Caddyfile`), then point the agent's exporter straight at it:

```
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_ENDPOINT=https://events.tailnet-xyz.example.com
OTEL_EXPORTER_OTLP_HEADERS=x-flow-tower-token=ft_lambda_…,Authorization=Bearer ft_lambda_…
```

Every request needs the token. Because the endpoint is public, keep the edge rate limit on, and start
with a sender token you can `revoke` at once. This is the fallback path: prefer the layer plus the
tailnet when you can, so the endpoint never faces the internet.
