# Command center (hub)

How to run one server that collects live events from many machines (laptops, teammates, a VPS, CI), what the
Hub panel (H) shows, and the **one home of the config file and its precedence**. Read it to set up or debug a hub or satellite.
Instead: copy-paste server steps in the [kit README](../examples/command-center/README.md); token rules, who
can view and the recipes in [hub-reference.md](hub-reference.md); a single machine in [getting-started.md](getting-started.md).
An agent can follow [`skills/flow-tower-command-center`](../skills/flow-tower-command-center/SKILL.md) (hub side) and [`skills/flow-tower-satellite`](../skills/flow-tower-satellite/SKILL.md) (sender side).

**In short** (a VPS for several machines; commands in the [kit](../examples/command-center/README.md)):

1. Enable hub mode: `--hub`, or `"hub": true` in `config.json`.
2. The hub listens on `127.0.0.1:5317`; put a transport in front (Tailscale or a reverse proxy).
3. Each machine connects: on a tailnet, `flow-tower connect https://<hub>.ts.net` mints its token (your login in `viewers`); elsewhere `flow-tower token add <id>` on the hub, then `connect --token` ([token rules](hub-reference.md#security-model)).
4. Each machine shares its towers: `flow-tower share <tower folder>` (YAML only by default; `--files` adds the files it references). The hub stores them in `towers/<machine>/` and keeps them in sync.

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

**Rule: the hub lights up only the towers in its library.** A connected machine shares each tower with
`flow-tower share <folder>`: the hub writes it into `towers/<machine>/<name>/` of its library folder and
reloads. Without that (or a hand-made copy in `towers/`), its events arrive but match no node.

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

On a tailnet, machines get their tokens by themselves: `flow-tower connect` asks the hub, which mints one for
a user listed in `viewers` ([enrolment](hub-reference.md#security-model)). Elsewhere, one token per machine or
person: `flow-tower token add laptop` prints it once (rules:
[hub-reference.md § Security model](hub-reference.md#security-model)). A hub with neither a token nor `viewers`
refuses to start (`hub mode needs a token to accept any event`). The hub binds `127.0.0.1:5317` only: other machines reach
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

**Caddy with TLS, a team without Tailscale.** [`integrations/hub/Caddyfile.hub`](../integrations/hub/Caddyfile.hub) forwards what a sender needs (events, heartbeat, OTLP, shared towers) to a full hub: teammates `connect --token` and `share` as on a tailnet; only the owner views, over SSH (below). Steps: [kit README § 5](../examples/command-center/README.md).

**Caddy with TLS on a public VPS, senders only.** For senders that cannot join a tailnet (Lambda, some CI). Senders
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
flow-tower connect https://hub.example.ts.net      # tailnet hub: the hub mints this machine's token
flow-tower share ~/my-project                      # the hub gets the tower (YAML only) and keeps it in sync
flow-tower ~/my-project                            # run your library as usual: accepted events are relayed
```

Without `--token`, `connect` asks the hub (`POST /api/hub/enroll`) for a token named after this machine
(the hostname, or `--machine`). That works only on a tailnet hub (`*.ts.net`, behind `tailscale serve`) and
only for a tailnet login in its `viewers`; the same login connecting the same machine again gets a new
token and the old one is revoked. Other hubs: `connect <url> --token ft_… --machine laptop --user alice`.

`connect` writes `role`, `url`, `token` (and machine/user) into the user folder's `config.json`, then
sends one heartbeat: `connected to … as laptop`, or a 401 / unreachable message. The guided version, for an
agent walking a user through it: [`skills/flow-tower-satellite`](../skills/flow-tower-satellite/SKILL.md).

**Share towers.** `flow-tower share <folder>` uploads the folder's `*.tower.yaml` files to the hub, which
writes them to `towers/<machine>/<name>/` in its library and reloads. `--files` also sends the files the towers
reference (inside the folder, text types only, never `.env`, keys or similar), so viewers can open them;
the default sends no file contents. The local library re-sends a shared tower within ~15 s of a change
(`/api/sharing` shows each tower's `syncedAt`), and nothing while sharing is paused. A tower with an error is
not sent: the hub keeps the last valid version, and the teammate sees `1 tower not sent` on the SAT chip and the
reason in Settings › Sharing › Shared towers (#190), which also warns when a sync removed nodes that events may still
name. The hub refuses a structurally broken upload too (422). On the hub, a shared card says `updated <time> ago`,
with a dot for a change in the last 10 minutes; a YAML-only tower's missing prompt and node files show as info, not
errors. `share --files` also carries `.github/`, `.claude/agents|skills|commands/`, `.agents/` and `.codex/prompts/`. `flow-tower unshare
<name>` removes it from the hub; `share --list` shows what is shared.

On the hub, each library card names its source (THIS HUB, or the device that shared it), and the FROM row filters by
device, with a green dot for a device online now; the filter stays in the URL (`?source=<machine>`). Only metadata is relayed; while the hub is down events queue in memory
([what is relayed, the queue, `/api/sharing`](hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

To pause sharing, set `paused: true` in `config.json` or use Settings › Sharing › Pause; a pause empties
the queue ([details](hub-reference.md#satellite-a-local-library-that-relays-to-the-hub)).

Hooks on a satellite post to the local library, which relays to the hub: `flow-tower hooks install` wires
Claude Code, Codex, Pi and Hermes in one step, on the library's port. `emit` never sends the config's hub token
to the local server, so no `--token ''` is needed.

**A machine without a library** (a server, a CI job) posts straight to the hub. Put `url` and `token`
in its `config.json`, or set `FLOW_TOWER_URL` / `FLOW_TOWER_TOKEN`, then use hooks or
`flow-tower emit --kind tool.start --agent ci -m "deploy"`. Raw HTTP: `POST /api/events` with
`x-flow-tower-token: ft_…` or `Authorization: Bearer ft_…`.

**Remote hosts with OpenTelemetry** (tokens and cost): run the collector next to the agent and let it
forward usage only: [integrations/otel-collector](../integrations/otel-collector),
[hub-reference.md § VPS recipe](hub-reference.md#recipe-a-vps--docker-host-collector-sidecar).
GitHub Actions and Lambda: [hub-reference.md § Recipes](hub-reference.md#recipe-github-actions).

## The Hub panel (H)

Press `H` in a tower on a hub to open it; in the library (where `H` types into the filter) click the `● n working`
chip next to the alerts pill. **Now** has one row per machine and session: `● machine · tower › node`, the state on
the right (`run · 12 s`), the user (when it differs from the machine) and runtime below, and the last error as
`✕ error · <node or tool> · <age>`. Click a row to open that tower on that node, the error line for the node that
failed. Rows carry no event text (no message, command or tool input): the Live feed has the details on this machine.
**Machines** lists every sender the hub trusts (token prefix, runtime, host,
last seen, state). The dot follows the clock: ● under 2 min, ◐ under 15 min, ○ silent (a revoked or
paused token shows ✕). The top-bar `HUB n/m` pill reads active senders seen in the last 5 min / active tokens (a revoked one counts in neither).
In a tower, `YAML n ERR` / `YAML n WARN` are the validation of the tower file; a red `LIVE n ERR` counts the live
error events of the tower on screen and opens the Live feed, where a failed tool shows ✕.
A remote viewer gets the same panel, read-only, with a `READ-ONLY` pill. It reads `/api/hub/machines`
and `/api/hub/me`; [security model](hub-reference.md#security-model).

**Alerts** lists what the hub warns about ([hub-alerts.md](hub-alerts.md)). **Admin** appears only on the hub machine
itself (never for a remote viewer, and its routes answer 404 to remote requests). From there you can:
- add a sender: its token and the `flow-tower connect` line are shown **once**, so copy them then; on loopback, replace
  `127.0.0.1` with the address other machines use;
- pause, resume or revoke a sender (type its id to revoke);
- manage the viewers, each sender's cadence (which sets the silent alert), monthly budgets in USD and the alert switches;
- set the raw retention days, and delete events before a date after a preview count (the monthly totals in the
  rollups stay, so budgets keep counting).

Every change writes one line to `admin-audit.jsonl` in the user folder (0600, never a token), shown at the bottom of
the tab. Everything there is also a field of `config.json` or a `flow-tower token` command, for scripts.

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
| `401 bad or missing token` | wrong, revoked or missing token: `connect` again (tailnet), or `flow-tower token add <id>` on the hub, then `connect --token` |
| `your tailnet login is not a viewer of this hub` (connect) | add that login (`tailscale status --json` → `User`) to `viewers` in the hub's config.json |
| `could not store the shared tower` (share) | the hub may not write `towers/` in its library folder: with the kit's unit, check `ReadWritePaths` |
| `403 remote viewing is not allowed` | not through Tailscale, or the login is not in `viewers` |
| `403 remote requests may only ingest events` | a remote client tried anything but sending events: by design |
| `/api/sharing` says `queued` | hub unreachable: check the URL, the tailnet and the hub service |
| `/api/sharing` says `revoked` | the hub refused the token: events wait in the queue; `connect` with a new token, and the running library picks it up with no restart |
| `/api/sharing` says `held` | the hub owner paused this machine: events wait and leave by themselves within 30 s of a resume |
| port already in use | the server exits with this message; another server runs there: `--port 5318`, or stop it |
| a setting is ignored | see [precedence](#configuration-file); an empty env var counts as unset |
| `allowedHosts` refused | it requires hub mode (`"hub": true` or `--hub`) |

## Privacy

A hub collects who worked on what and when. Profiles for teams of employees or freelancers (notice,
opt-in, retention) are planned in [#85](https://github.com/JamesMoriartyDecripto/flow-tower/issues/85).
This page is not legal advice: check your local rules before collecting other people's activity.
