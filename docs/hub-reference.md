# Hub reference

What a hub accepts and from whom: the **one home of the token rules and of who may view**, the satellite
internals, and recipes per sender (second computer, teammate, VPS, GitHub Actions, Lambda). Read it to
change hub code or check a security question. Setup steps and config precedence: [command-center.md](command-center.md);
local live events: [realtime.md](realtime.md).

## Connect remote sources

By default Flow Tower only listens on `127.0.0.1`: a second machine, a teammate or a cloud runner cannot
reach it. Hub mode opens the event ingest to them **without** letting them read your files.

```bash
npm link                              # put flow-tower on your PATH (realtime.md § Any other agent)
flow-tower token add alice            # prints ft_alice_<secret> once: hand it to that machine
flow-tower --hub --allowed-host hub.tailnet-xyz.ts.net
```

The same settings go in `config.json`: keys and precedence in
[command-center.md § Configuration file](command-center.md#configuration-file). Then put `tailscale serve` in front
([tailscale.com/kb/1312/serve](https://tailscale.com/kb/1312/serve)): the server still binds loopback, Tailscale
terminates TLS. Never `tailscale funnel`: Funnel exposes to the whole internet, serve to your tailnet.

A remote sender posts to the usual `/api/events` (or `/v1/logs`) with its token:
`x-flow-tower-token: ft_alice_<secret>` (the OTel exporters and the collector use a `Authorization: Bearer`
too). What it may do:

- **ingest events** with a valid token — the token id becomes the sender, and events are attributed to it;
- **view** the UI (read-only) only when its tailnet login is listed in `viewers`
  (`hub.json` still works, with a deprecation warning);
- **nothing else**. Files (`/api/file`), voice (`/api/voice`) and every write are refused for remote
  requests: they act on the machine that runs Flow Tower, not on the sender's.

Hub mode needs at least one token to start: a shared hub must never accept an unsigned event. Rate limits,
dedupe and a ±24 h timestamp window apply to remote senders (see **Security model** below). Recipes live
under [`integrations/hub/`](../integrations/hub/): ACLs, GitHub Actions, Docker and Lambda.

**Public ingest-only (Fallback).** When a Tailscale tailnet is not an option (AWS Lambda, a CI runner),
run `flow-tower --ingest-only` behind Caddy or Cloudflare Tunnel. That mode serves **nothing but** the
ingest routes, needs a token for every request (like hub mode), and 404s everything else even locally; it
must never be exposed without one of those proxies in front, and
it is a last resort, not the default. See [`integrations/hub/Caddyfile`](../integrations/hub/Caddyfile).

### Recipe: a second computer

Both machines join the same tailnet. On the hub machine:

```bash
flow-tower token add laptop
flow-tower ~/towers/game-studio.tower.yaml --hub --allowed-host hub.tailnet-xyz.ts.net
tailscale serve --bg --https=443 http://127.0.0.1:5317
```

On the laptop, put the sender's settings in `~/.config/flow-tower/config.json`:

```jsonc
{
  // sender: where this machine posts its events, and who it is. `flow-tower emit` reads it, so hooks
  // need no environment at all. Keep the file 0600: it holds the token.
  "url": "https://hub.tailnet-xyz.ts.net",
  "user": "alice",
  "machine": "laptop",
  "token": "ft_laptop_<secret>",
  "role": "satellite"
}
```

Then just send events:

```bash
flow-tower emit --kind tool.start --agent claude-code -m "opened the repo"
```

Open `https://hub.tailnet-xyz.ts.net` in the laptop browser to watch, if its tailnet user is a viewer.

### Satellite: a local library that relays to the hub

A **satellite** is a workstation that runs its own flow-tower (its own towers, its own live view) and
forwards what it accepts to the hub. One command sets it up:

```bash
flow-tower connect https://hub.tailnet-xyz.ts.net --token ft_laptop_<secret> --machine laptop --user alice
```

It writes `role: "satellite"`, `url`, `token` and (when given) `machine`/`user` into
`<FLOW_TOWER_HOME or ~/.config/flow-tower>/config.json`, keeping every other key, then sends one
heartbeat. Three answers, all exit 0: `connected to <url> as <sender>` (204); the token was refused
(401) — the config is still written, and `flow-tower token add <id>` on the hub plus a second
`connect` fixes it; the hub is unreachable — also written, since the relay will queue. Only bad
arguments exit 1. The token is never printed by this command.

**What is relayed.** Content-free events, exactly as the hub's own history would store them: time,
sender, user, host, runtime, project, session, kind, tool, model, tokens, cost, duration, status.
Prompts, responses, commands, file paths and tool output never leave the machine (the relay drops
them before sending), and a `request_id` survives only as an opaque correlation id.

**While the hub is down.** The queue is bounded at **5000** events, oldest dropped first, and lives
in memory: a long outage costs a counter, not the disk. A **revoked** (or paused) token stops the
sending entirely — the events stay queued and the state says `revoked` until someone fixes the token
— so a returned laptop cannot keep feeding a hub that no longer trusts it.

**Reading it.** `GET /api/sharing` on the satellite answers its relay state
(`online` | `queued` | `revoked`, hub url, queued/dropped counters, last error) and never the token;
a server that is not a satellite answers `{ "state": "off" }`. On the hub, each satellite posts
`POST /api/heartbeat` (counters and state word, authenticated like `/api/events`) and every accepted
event counts as a sign of life; `GET /api/hub/satellites` lists them, calling one offline after three
missed minute-long beats.

### Recipe: a teammate

Same as above, but create a token per person (`flow-tower token add bob`) and add their email to
`viewers` if they should watch, not just send. Attribute usage with `OTEL_RESOURCE_ATTRIBUTES="enduser.id=bob"`.
When they leave, `flow-tower token revoke bob` stops their sender at once; `pause` / `resume` do the same
temporarily. The plaintext is never stored, only its sha256, so a stolen `tokens.json` is useless.

### Recipe: a VPS / Docker host (collector sidecar)

Run the collector next to the agent on the VPS, so only usage leaves the host and prompts stay in. The
sidecar forwards to your hub over the tailnet; see [`integrations/hub/docker-compose.yml`](../integrations/hub/docker-compose.yml)
and [`integrations/otel-collector/collector.yaml`](../integrations/otel-collector/collector.yaml). A
container has no user folder unless you mount one, so it gets the same settings from the environment
([precedence](command-center.md#configuration-file)):

```yaml
environment:
  FLOW_TOWER_URL: https://hub.tailnet-xyz.ts.net
  FLOW_TOWER_TOKEN: ft_vps_<secret>
  FLOW_TOWER_USER: alice
  FLOW_TOWER_MACHINE: vps-1
  # or mount the host's config read-only instead of passing the token as an env var:
  # volumes: [ "~/.config/flow-tower:/home/user/.config/flow-tower:ro" ]
```

### Recipe: GitHub Actions

A workflow can watch a CI run in your tower. The runner joins the tailnet with an ephemeral node tagged
`tag:ci` and posts to the hub — see [`integrations/hub/github-actions.yml`](../integrations/hub/github-actions.yml)
and the ACL in [`integrations/hub/acl.hujson`](../integrations/hub/acl.hujson). The tailnet ACL must grant
`tag:flow-sender` (the sender) access to the hub's `tag:flow-hub` on port 443, and the tag itself must be
allowed to use the tailnet — an untagged, ephemeral node cannot.

### Recipe: AWS Lambda

Lambda has no loopback and its own filesystem is read-only, so pick one:

- run the **OTel Collector as a Lambda layer** and let it hold the tailnet userspace networking
  ([tailscale.com/kb/1113/aws-lambda](https://tailscale.com/kb/1113/aws-lambda)), forwarding OTLP to the hub; or
- send **OTLP/HTTP directly** to the public ingest-only endpoint (`--ingest-only` behind Caddy or Cloudflare
  Tunnel), with `x-flow-tower-token` on every request. Direct is simplest but exposes an ingest endpoint to
  the internet, so a token is mandatory (the hub rate-limits ingest itself).

## Security model

Hub mode changes what the server accepts; this is the one place it is stated:

- **Binding.** Without `--hub` the server refuses a non-loopback `--host`, and `--allowed-host` (a proxy's
  own Host header means the server is reachable through that proxy) is refused too: the CLI exits 1 and says
  to add `--hub`. With `--hub` it still runs on `127.0.0.1` and is reached only through `tailscale serve`
  (TLS on the tailnet). Never Funnel.
- **Only a proxy that says so.** The hub tells a remote request from a local one by the socket and by the
  proxy headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `Tailscale-User-Login`). `tailscale serve` sets
  them. Never put a forwarder that adds none in front of the hub port (`ssh -L`/`-R`, `socat`, a proxy told
  to drop them): its requests would look local and skip every hub rule.
- **Sender identity.** A per-sender token (`flow-tower token add|list|revoke|pause|resume`) is stored as
  its **sha256** in `~/.config/flow-tower/tokens.json` (0600), never the plaintext. The **token decides who
  sent it**: the id in `ft_<id>_<secret>` is the sender, and events are attributed to it. `revoke` /
  `pause` take effect on the next request, with no server restart. The legacy single `FLOW_TOWER_TOKEN`
  still works and is attributed to `default`.
- **The config `token` is a sender credential.** It is what `emit` and the satellite relay send to a hub,
  never a secret guarding this server: a revoked token pasted into `config.json` must not authenticate here.
  The server's own secrets are `FLOW_TOWER_TOKEN` and `tokens.json` (`bin/flow-tower.js`).
- **What a remote request can do.** Ingest an event with a token, and — for a tailnet user listed in
  `viewers` (config.json) — view the UI read-only. It can never read files, drive voice or make any other
  write: those routes answer 403 to a remote request. Anything the socket or the proxy headers say came
  from off the machine is treated as remote.
- **Public fallback.** `--ingest-only` serves only `/api/events` and `/v1/*`, to anyone, and 404s
  everything else including locally. It needs a token for **every** request, like hub mode: the CLI exits 1
  without `FLOW_TOWER_TOKEN` or an active per-sender token. Put Caddy or Cloudflare Tunnel in front; it is
  for Lambda and CI, never for a workstation hub.
- **Viewing is gated everywhere it reaches the host.** A WebSocket upgrade (Vite HMR/ws) is checked the
  same way as a page view: only loopback, or a listed viewer through the local proxy, may open it, so a
  remote stranger cannot subscribe to the live event stream. A remote viewer also never reaches Vite's
  `/@fs/` (which would read any file on the host) nor the file and voice routes (`/api/file`, `/api/voice`).
- **Abuse limits.** Per-sender token bucket (20 events/s, burst 200; 429 with `Retry-After`), an LRU
  dedupe of event ids (50,000) so a retrying sender cannot replay the same event, and a ±24 h window around
  now so a skewed or backdated timestamp is dropped. All in memory: a restart forgets them.
- **Transport.** Ingest bodies keep their existing caps (JSON, gzip decompressed cap, `MAX_BATCH`), the
  exact `application/json` content type and the same-site checks as the local server. `/api/events` still
  answers `204` with an empty body. Local requests (no proxy header, loopback socket) keep the old
  behaviour: no token needed unless `FLOW_TOWER_TOKEN` is set.

## References

- Tailscale serve: https://tailscale.com/kb/1312/serve (ACLs: https://tailscale.com/kb/1018/acls)
- Tailscale on AWS Lambda (userspace networking): https://tailscale.com/kb/1113/aws-lambda
- GitHub Actions + Tailscale: https://github.com/tailscale/github-action
