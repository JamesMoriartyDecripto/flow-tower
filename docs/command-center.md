# Command center (hub)

How to run one server that collects live events from many machines (laptops, teammates, a VPS, CI), what the
Hub panel (H) shows, and the **one home of the config file and its precedence**. Read it to set up or debug a hub or satellite.
Instead: copy-paste server steps in the [kit README](../examples/command-center/README.md); token rules, who
can view and the recipes in [hub-reference.md](hub-reference.md); a single machine in [getting-started.md](getting-started.md).

**In short** (a VPS for several machines; commands in the [kit](../examples/command-center/README.md)):

1. Enable hub mode: `--hub`, or `"hub": true` in `config.json`.
2. The hub listens on `127.0.0.1:5317`; put a transport in front (Tailscale or a reverse proxy).
3. One token per machine: `flow-tower token add <id>` on the hub ([token rules](hub-reference.md#security-model)).

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

## Set up the hub

Install, `config.json`, tokens and the service (systemd unit or docker compose): follow the
[kit README](../examples/command-center/README.md) steps 1 to 3. The hub's config (all keys in
[config.example.json](../config.example.json); precedence [below](#configuration-file)):

```jsonc
{
  "hub": true,
  "role": "hub",
  "allowedHosts": ["hub.example.ts.net"],   // the name the proxy forwards with
  "viewers": ["alice@example.com"],         // tailnet logins allowed to view, read-only
  "retentionDays": 14                       // raw history kept, 1..21
}
```

One token per machine or person: `flow-tower token add laptop` prints it once (rules:
[hub-reference.md § Security model](hub-reference.md#security-model)). A hub with no token refuses to start
(`hub mode needs a token to accept any event`). The hub binds `127.0.0.1:5317` only: other machines reach
it through a proxy. Containers sending *to* the hub:
[integrations/hub/docker-compose.yml](../integrations/hub/docker-compose.yml).

## Put a transport in front

**Tailscale serve (recommended).** TLS on your tailnet, never the public internet, and the only way to
let other people **view** the hub UI:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:5317    # never `tailscale funnel`
```

Only tailnet logins listed in `viewers` may view the UI; everyone else may only send events with a token
([who can do what](hub-reference.md#security-model)).
ACLs and tags: [integrations/hub/tailscale-serve.md](../integrations/hub/tailscale-serve.md),
[acl.hujson](../integrations/hub/acl.hujson).

**Caddy with TLS on a public VPS.** For senders that cannot join a tailnet (Lambda, some CI). Senders
need a token on every request. Remote viewing does **not** work through Caddy: a forwarded request
without a tailnet identity gets `403`. Two ways:

- keep the hub (`"hub": true`, your domain in `allowedHosts`) and let Caddy forward only
  `/api/events`, `/api/heartbeat` and `/v1/*`; you view it over SSH (below);
- or run `flow-tower --ingest-only`, which serves nothing but ingest (no UI, even locally), as in
  [integrations/hub/Caddyfile](../integrations/hub/Caddyfile), which forwards the same three routes.

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
anyway). The hub lights only towers in its own library, so register the same tower on the hub's machine
([Your own library](getting-started.md#your-own-library)). Only metadata is relayed; while the hub is down events queue in memory
([what is relayed, the queue, `/api/sharing`](hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

To pause sharing, set `paused: true` in `config.json` or use Settings › Sharing › Pause; a pause empties
the queue ([details](hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

Hooks on a satellite should post to the local server without a token: Claude Code's `http` hooks do.
`flow-tower emit` reads the hub token from the same config file and the local server refuses it (401,
silently), so pass `--token ''` to `emit` there.

**A machine without a library** (a server, a CI job) posts straight to the hub. Put `url` and `token`
in its `config.json`, or set `FLOW_TOWER_URL` / `FLOW_TOWER_TOKEN`, then use hooks or
`flow-tower emit --kind tool.start --agent ci -m "deploy"`. Raw HTTP: `POST /api/events` with
`x-flow-tower-token: ft_…` or `Authorization: Bearer ft_…`.

**Remote hosts with OpenTelemetry** (tokens and cost): run the collector next to the agent and let it
forward usage only: [integrations/otel-collector](../integrations/otel-collector),
[hub-reference.md § VPS recipe](hub-reference.md#recipe-a-vps--docker-host-collector-sidecar).
GitHub Actions and Lambda: [hub-reference.md § Recipes](hub-reference.md#recipe-github-actions).

## The Hub panel (H)

Press `H` on a hub to open it. **Now** lists who runs what right now (machine, runtime, project,
starter — `AUTO` for CI); **Machines** lists every sender the hub trusts (token prefix, runtime, host,
last seen, state). The dot follows the clock: ● under 2 min, ◐ under 15 min, ○ silent (a revoked or
paused token shows ✕). The top-bar `HUB n/m` pill reads senders seen in the last 5 min / active tokens.
A remote viewer gets the same panel, read-only, with a `READ-ONLY` pill. It reads `/api/hub/machines`
and `/api/hub/me`; [security model](hub-reference.md#security-model).

## Configuration file

Hub and `emit` settings share one file: `~/.config/flow-tower/config.json` (or `$FLOW_TOWER_HOME/config.json`), JSONC. It holds the hub's `hub`, `host`, `allowedHosts`, `ingestOnly`, `viewers`, `retentionDays` and a sender's `url`, `user`, `machine`, `token`, so one machine needs no pile of environment variables. A checkout may also carry a git-ignored `flow-tower.local.json` next to `package.json` for the machine it sits on; the user's own file wins key by key. [`config.example.json`](../config.example.json) lists every key with a one-line comment.

Precedence is **flags > environment > config file > defaults** for every key both a flag and a file can set. An empty environment variable counts as unset: `FLOW_TOWER_HUB=''` (a common compose or CI default) never switches off a hub the file turns on. After `npm link`, `flow-tower config path` prints the files a load would read and which exist, and `flow-tower config show` prints every effective value with its source (the token redacted). `tokens.json` and `history.db` are **data**, not config: they stay in the user folder and are never read from `config.json`.

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
| a setting is ignored | see [precedence](#configuration-file); an empty env var counts as unset |
| `allowedHosts` refused | it requires hub mode (`"hub": true` or `--hub`) |

## Privacy

A hub collects who worked on what and when. Profiles for teams of employees or freelancers (notice,
opt-in, retention) are planned in [#85](https://github.com/JamesMoriartyDecripto/flow-tower/issues/85).
This page is not legal advice: check your local rules before collecting other people's activity.
