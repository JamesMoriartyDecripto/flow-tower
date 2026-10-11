# Command center (hub)

One server that collects the live events of many machines: your laptops, a teammate, a VPS, CI. It is a
normal Flow Tower started in **hub mode**. Reference details: [realtime.md](realtime.md#connect-remote-sources)
and its [Security model](realtime.md#security-model). Your first towers: [getting-started.md](getting-started.md).

## Three roles

```
 laptop (satellite)              VPS / dedicated server (hub)
 own towers, own live view       flow-tower --hub on 127.0.0.1:5317
 relays metadata ───token──▶ tailscale serve or Caddy (TLS) ──▶ hub ◀── viewers (tailnet logins)
                                       ▲
 CI runner / container ──token─────────┘  (emit, hooks or the OTel collector; no library)
```

| Role | What it runs | `role` in config.json |
|---|---|---|
| local | the default: one machine, loopback only, no tokens | `local` |
| hub | the shared server: accepts events with a per-sender token | `hub` |
| satellite | a local library that also forwards to the hub | `satellite` |

## Start from the kit

Copy [`examples/command-center/`](../examples/command-center) to your server: it has the hub's own
tower, `deploy/` (systemd unit, docker compose, Caddyfile, `hub.config.json`, `satellite.config.json`),
a `towers/` folder and a step-by-step README. Follow that README for the copy-paste steps; this page
explains the parts.

**Rule: the hub lights up only the towers in its library.** Put each connected machine's tower in the
hub's `towers/` folder, or its events arrive but match no node.

## Set up the hub on a VPS or dedicated server

The kit's README has the exact steps; in short:

```bash
# as an unprivileged user, e.g. "flowtower"
git clone https://github.com/JamesMoriartyDecripto/flow-tower.git /opt/flow-tower
cd /opt/flow-tower && npm ci && npm link        # Node >= 22.12; `which node` for the unit below
cp -R /opt/flow-tower/examples/command-center /srv/command-center   # the kit; towers go in its towers/
```

`~/.config/flow-tower/config.json` on the hub (`chmod 600`; all keys in
[config.example.json](../config.example.json)):

```jsonc
{
  "hub": true,
  "role": "hub",
  "allowedHosts": ["hub.example.ts.net"],   // the name the proxy forwards with
  "viewers": ["alice@example.com"],         // tailnet logins allowed to view, read-only
  "retentionDays": 14
}
```

One token per machine or person. The plaintext is printed once; only its sha256 is stored:

```bash
flow-tower token add laptop        # ft_laptop_… : hand it to that machine
flow-tower token list              # revoke <id> | pause <id> | resume <id>
```

A hub with no token refuses to start (`hub mode needs a token to accept any event`).

**Run it as a service.** A systemd unit, `/etc/systemd/system/flow-tower.service`:

```ini
[Unit]
Description=Flow Tower hub
After=network-online.target

[Service]
User=flowtower
WorkingDirectory=/opt/flow-tower
ExecStart=/usr/bin/node /opt/flow-tower/bin/flow-tower.js /srv/command-center --no-open --no-update-check
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now flow-tower`; logs with `journalctl -u flow-tower -f`. It binds
`127.0.0.1:5317` and nothing else: a proxy below is what other machines reach. Containers sending *to*
the hub: [integrations/hub/docker-compose.yml](../integrations/hub/docker-compose.yml).

## Put a transport in front

**Tailscale serve (recommended).** TLS on your tailnet, never the public internet, and the only way to
let other people **view** the hub UI:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:5317    # never `tailscale funnel`
```

Tailscale adds `tailscale-user-login` to each request; the hub shows the UI only when that login is in
`viewers` (and the request comes from the local proxy). Everyone else may only send events with a token.
ACLs and tags: [integrations/hub/tailscale-serve.md](../integrations/hub/tailscale-serve.md),
[acl.hujson](../integrations/hub/acl.hujson).

**Caddy with TLS on a public VPS.** For senders that cannot join a tailnet (Lambda, some CI). Senders
need a token on every request. Remote viewing does **not** work through Caddy: a forwarded request
without a tailnet identity gets `403`. Two ways:

- keep the hub (`"hub": true`, your domain in `allowedHosts`) and let Caddy forward only
  `/api/events`, `/api/heartbeat` and `/v1/*`; you view it over SSH (below);
- or run `flow-tower --ingest-only`, which serves nothing but ingest (no UI, even locally), as in
  [integrations/hub/Caddyfile](../integrations/hub/Caddyfile). That file forwards no `/api/heartbeat`:
  add it if satellites connect through it.

**Viewing as the owner without Tailscale.** Forward the port over SSH from your own computer:

```bash
ssh -N -L 5317:127.0.0.1:5317 you@hub.example.com    # then open http://127.0.0.1:5317
```

The hub sees a local request with full access, so this is for the owner only. **Rule:** never put an
SSH tunnel, `socat` or any forwarder that strips or adds no proxy headers in front of the hub for other
machines' traffic: their requests look local and skip the token check.

## Connect to it

**A satellite** (a machine with its own library):

```bash
flow-tower connect https://hub.example.ts.net --token ft_REPLACE_ME --machine laptop --user alice
flow-tower ~/my-project            # run your library as usual: accepted events are relayed
```

`connect` writes `role`, `url`, `token` (and machine/user) into the user folder's `config.json`, then
sends one heartbeat: `connected to … as laptop`, or a 401 / unreachable message (the config is written
anyway). Only metadata is relayed (kind, tool, model, tokens, cost, timing); prompts, messages and tool
output stay on the machine. While the hub is down events queue in memory (max 5000, oldest dropped).
`curl http://127.0.0.1:5317/api/sharing` on the satellite shows `online` | `queued` | `revoked`.

Hooks on a satellite should post to the local server without a token: Claude Code's `http` hooks do.
`flow-tower emit` reads the hub token from the same config file and the local server refuses it (401,
silently), so pass `--token ''` to `emit` there.

**A machine without a library** (a server, a CI job) posts straight to the hub. Put `url` and `token`
in its `config.json`, or set `FLOW_TOWER_URL` / `FLOW_TOWER_TOKEN`, then use hooks or
`flow-tower emit --kind tool.start --agent ci -m "deploy"`. Raw HTTP: `POST /api/events` with
`x-flow-tower-token: ft_…` or `Authorization: Bearer ft_…`.

**Remote hosts with OpenTelemetry** (tokens and cost): run the collector next to the agent and let it
forward usage only: [integrations/otel-collector](../integrations/otel-collector),
[realtime.md § VPS recipe](realtime.md#recipe-a-vps--docker-host-collector-sidecar).
GitHub Actions and Lambda: [realtime.md § Recipes](realtime.md#recipe-github-actions).

## Check it

| Where | Command | Shows |
|---|---|---|
| any machine | `flow-tower config show` | every effective setting and its source (token redacted) |
| hub | `curl http://127.0.0.1:5317/api/hub/satellites` | each satellite, last seen, queued, online |
| hub | `curl http://127.0.0.1:5317/api/history/info` | history rows kept and the retention |
| satellite | `curl http://127.0.0.1:5317/api/sharing` | relay state, queued and dropped counts |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `401 bad or missing token` | wrong, revoked or missing token: `flow-tower token add <id>` on the hub, then `connect` again |
| `403 remote viewing is not allowed` | not through Tailscale, or the login is not in `viewers` |
| `403 remote requests may only ingest events` | a remote client tried anything but sending events: by design |
| `/api/sharing` says `queued` | hub unreachable: check the URL, the tailnet and the hub service |
| `/api/sharing` says `revoked` | the hub refused the token; sending stops until a new token and `connect` |
| port already in use | another server runs there: `--port 5318`, or stop it |
| a setting is ignored | flags > environment > config file; an empty env var (`FLOW_TOWER_HUB=''`) counts as unset |
| `allowedHosts` refused | it requires hub mode (`"hub": true` or `--hub`) |

## Privacy

A hub collects who worked on what and when. Profiles for teams of employees or freelancers (notice,
opt-in, retention) are planned in [#85](https://github.com/JamesMoriartyDecripto/flow-tower/issues/85).
This page is not legal advice: check your local rules before collecting other people's activity.
